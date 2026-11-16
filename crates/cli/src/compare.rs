//! What changed between two screenshots, as text: the regions whose pixels differ and the text that differs in them.

use phonedriver_core::error::Error;
use phonedriver_core::geometry::{Rect, Size};
use phonedriver_core::ocr::TextBox;

/// One picture as brightness, a byte a pixel.
#[derive(Debug, Clone, PartialEq)]
pub struct Picture {
    pub width: usize,
    pub height: usize,
    pub luma: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TextChange {
    Changed { from: String, to: String, at: Rect },
    Added { text: String, at: Rect },
    Removed { text: String, at: Rect },
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Report {
    /// Changed regions in pixels of the pictures, top to bottom.
    pub regions: Vec<Rect>,
    /// The share of the picture inside changed cells, 0 to 1.
    pub share: f32,
    pub text: Vec<TextChange>,
    /// Why the text of the two pictures was not compared, when it was not.
    pub unread: Option<String>,
}

/// A cell is this many pixels on a side.
const CELL: usize = 8;

/// A cell has changed when its pixels differ by more than this on average, out of 255. Screenshots come out of a
/// video encoder, so two of one still screen are not equal: across 13 pairs from the API 37 emulator the largest
/// cell average was 2.6, and the smallest in a cell that had changed on the screen was 9.3.
const CHANGED: f32 = 4.0;

/// Changed cells this close together, counted in cells, are one region.
const NEAR: usize = 3;

const LINES: usize = 12;

pub fn decode(png: &[u8]) -> Result<Picture, String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(png));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![
        0;
        reader
            .output_buffer_size()
            .ok_or("the picture is too large")?
    ];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let channels = info.color_type.samples();
    let luma = buf[..info.buffer_size()]
        .chunks_exact(channels)
        .map(|px| match channels {
            1 | 2 => px[0],
            _ => {
                ((299 * u32::from(px[0]) + 587 * u32::from(px[1]) + 114 * u32::from(px[2])) / 1000)
                    as u8
            }
        })
        .collect();
    Ok(Picture {
        width: info.width as usize,
        height: info.height as usize,
        luma,
    })
}

/// The regions where two pictures of one size differ, and the share of the picture that lies in changed cells.
pub fn regions(before: &Picture, after: &Picture) -> (Vec<Rect>, f32) {
    let (cols, rows) = (before.width.div_ceil(CELL), before.height.div_ceil(CELL));
    let mut changed = vec![false; cols * rows];
    let mut area = 0;
    for row in 0..rows {
        for col in 0..cols {
            let (x1, y1) = (
                ((col + 1) * CELL).min(before.width),
                ((row + 1) * CELL).min(before.height),
            );
            let mut sum = 0u32;
            for y in row * CELL..y1 {
                let line = y * before.width;
                for x in col * CELL..x1 {
                    sum += u32::from(before.luma[line + x].abs_diff(after.luma[line + x]));
                }
            }
            let pixels = (x1 - col * CELL) * (y1 - row * CELL);
            if sum as f32 > CHANGED * pixels as f32 {
                changed[row * cols + col] = true;
                area += pixels;
            }
        }
    }
    let mut seen = vec![false; cols * rows];
    let mut found = Vec::new();
    for start in 0..cols * rows {
        if !changed[start] || seen[start] {
            continue;
        }
        seen[start] = true;
        let mut open = vec![start];
        let (mut c0, mut r0, mut c1, mut r1) = (cols, rows, 0, 0);
        while let Some(cell) = open.pop() {
            let (row, col) = (cell / cols, cell % cols);
            (c0, r0, c1, r1) = (c0.min(col), r0.min(row), c1.max(col), r1.max(row));
            for r in row.saturating_sub(NEAR)..(row + NEAR + 1).min(rows) {
                for c in col.saturating_sub(NEAR)..(col + NEAR + 1).min(cols) {
                    let next = r * cols + c;
                    if changed[next] && !seen[next] {
                        seen[next] = true;
                        open.push(next);
                    }
                }
            }
        }
        let (x1, y1) = (
            ((c1 + 1) * CELL).min(before.width),
            ((r1 + 1) * CELL).min(before.height),
        );
        let mut region = Rect {
            x: (c0 * CELL) as f32,
            y: (r0 * CELL) as f32,
            w: (x1 - c0 * CELL) as f32,
            h: (y1 - r0 * CELL) as f32,
        };
        while let Some(i) = found.iter().position(|f: &Rect| f.clip(region).is_some()) {
            region = region.union(found.swap_remove(i));
        }
        found.push(region);
    }
    found.sort_by(|a, b| {
        (a.y, a.x)
            .partial_cmp(&(b.y, b.x))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    (found, area as f32 / (before.width * before.height) as f32)
}

fn overlap(a: Rect, b: Rect) -> f32 {
    a.clip(b).map_or(0.0, |i| i.area() / a.area().min(b.area()))
}

fn touches(b: Rect, regions: &[Rect]) -> bool {
    regions
        .iter()
        .any(|r| b.clip(*r).is_some_and(|i| i.area() > 0.0))
}

/// A status bar's icons are read as marks beside its text (`9:20` and then `9:20 •` when a notification dot came),
/// so text is the same when its letters and digits are.
fn letters(text: &str) -> String {
    text.chars().filter(|c| c.is_alphanumeric()).collect()
}

fn at(change: &TextChange) -> Rect {
    match change {
        TextChange::Changed { at, .. }
        | TextChange::Added { at, .. }
        | TextChange::Removed { at, .. } => *at,
    }
}

/// The text that differs inside the changed regions. Text read differently where no pixel changed is the reader's
/// own variation and is left out.
pub fn text_changes(before: &[TextBox], after: &[TextBox], regions: &[Rect]) -> Vec<TextChange> {
    let mut out = Vec::new();
    let mut matched = vec![false; before.len()];
    for a in after {
        let was = before
            .iter()
            .position(|b| overlap(a.bounds, b.bounds) > 0.5);
        if let Some(i) = was {
            matched[i] = true;
        }
        if !touches(a.bounds, regions) {
            continue;
        }
        match was {
            Some(i) if letters(&before[i].text) == letters(&a.text) => {}
            Some(i) => out.push(TextChange::Changed {
                from: before[i].text.clone(),
                to: a.text.clone(),
                at: a.bounds,
            }),
            None => out.push(TextChange::Added {
                text: a.text.clone(),
                at: a.bounds,
            }),
        }
    }
    for (b, _) in before
        .iter()
        .zip(&matched)
        .filter(|(b, m)| !**m && touches(b.bounds, regions))
    {
        out.push(TextChange::Removed {
            text: b.text.clone(),
            at: b.bounds,
        });
    }
    out.sort_by(|a, b| {
        (at(a).y, at(a).x)
            .partial_cmp(&(at(b).y, at(b).x))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out
}

/// Compares two PNG screenshots of one size. Text is read from both only when pixels differ.
pub fn compare(before_png: &[u8], after_png: &[u8]) -> Result<Report, String> {
    let before =
        decode(before_png).map_err(|e| format!("the first picture cannot be read: {e}"))?;
    let after = decode(after_png).map_err(|e| format!("the second picture cannot be read: {e}"))?;
    if (before.width, before.height) != (after.width, after.height) {
        return Err(format!(
            "the pictures are {}x{} and {}x{}; compare two screenshots of one device",
            before.width, before.height, after.width, after.height
        ));
    }
    let (regions, share) = regions(&before, &after);
    let mut report = Report {
        regions,
        share,
        ..Report::default()
    };
    if report.regions.is_empty() {
        return Ok(report);
    }
    let screen = Size {
        w: before.width as f32,
        h: before.height as f32,
    };
    let read = |png: &[u8]| -> Result<Vec<TextBox>, Error> { crate::ocr::recognize(png, screen) };
    match (read(before_png), read(after_png)) {
        (Ok(b), Ok(a)) => report.text = text_changes(&b, &a, &report.regions),
        (Err(e), _) | (_, Err(e)) => report.unread = Some(e.to_string()),
    }
    Ok(report)
}

fn place(r: Rect) -> String {
    format!(
        "{},{}",
        (r.x + r.w / 2.0).round(),
        (r.y + r.h / 2.0).round()
    )
}

/// `same`, or a first line with the size of the change, a line for each text change (`~`, `+`, `-`, with the
/// point to tap) and a line for each region where no text changed.
pub fn render(report: &Report) -> String {
    if report.regions.is_empty() {
        return "same".into();
    }
    let n = report.regions.len();
    let mut lines = vec![format!(
        "changed: {n} region{}, {:.1}% of the screen",
        if n == 1 { "" } else { "s" },
        report.share * 100.0
    )];
    let mut body: Vec<String> = report
        .text
        .iter()
        .map(|c| match c {
            TextChange::Changed { from, to, at } => {
                format!("~ {from:?} → {to:?} at {}", place(*at))
            }
            TextChange::Added { text, at } => format!("+ {text:?} at {}", place(*at)),
            TextChange::Removed { text, at } => format!("- {text:?} at {}", place(*at)),
        })
        .collect();
    let silent = report.regions.iter().filter(|r| {
        !report
            .text
            .iter()
            .any(|c| touches(at(c), std::slice::from_ref(r)))
    });
    body.extend(silent.map(|r| {
        let note = if report.unread.is_some() {
            ""
        } else {
            " (no text changed)"
        };
        format!("region {},{} {}x{}{note}", r.x, r.y, r.w, r.h)
    }));
    let more = body.len().saturating_sub(LINES);
    lines.extend(body.into_iter().take(LINES));
    if more > 0 {
        lines.push(format!("and {more} more"));
    }
    if let Some(why) = &report.unread {
        lines.push(format!("text not compared: {why}"));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(width: usize, height: usize, shade: u8) -> Picture {
        Picture {
            width,
            height,
            luma: vec![shade; width * height],
        }
    }

    fn painted(mut p: Picture, x: usize, y: usize, w: usize, h: usize, shade: u8) -> Picture {
        for row in y..y + h {
            for col in x..x + w {
                p.luma[row * p.width + col] = shade;
            }
        }
        p
    }

    fn rect(x: f32, y: f32, w: f32, h: f32) -> Rect {
        Rect { x, y, w, h }
    }

    fn text(s: &str, x: f32, y: f32) -> TextBox {
        TextBox {
            text: s.into(),
            bounds: rect(x, y, 60.0, 16.0),
            confidence: 1.0,
        }
    }

    #[test]
    fn two_pictures_that_differ_by_encoder_noise_are_the_same() {
        let before = flat(160, 320, 200);
        let mut after = before.clone();
        for (i, v) in after.luma.iter_mut().enumerate() {
            *v = v.wrapping_add((i % 3) as u8);
        }
        assert_eq!(regions(&before, &after), (vec![], 0.0));
    }

    #[test]
    fn a_changed_patch_is_one_region_with_its_bounds_and_its_share_of_the_picture() {
        let before = flat(160, 320, 200);
        let after = painted(before.clone(), 16, 32, 48, 16, 20);
        let (found, share) = regions(&before, &after);
        assert_eq!(found, vec![rect(16.0, 32.0, 48.0, 16.0)]);
        assert!(
            (share - (48.0 * 16.0) / (160.0 * 320.0)).abs() < 1e-6,
            "{share}"
        );
    }

    #[test]
    fn patches_far_apart_are_two_regions_and_patches_close_together_are_one() {
        let before = flat(160, 320, 200);
        let far = painted(
            painted(before.clone(), 8, 8, 16, 16, 20),
            8,
            200,
            16,
            16,
            20,
        );
        assert_eq!(regions(&before, &far).0.len(), 2);
        let near = painted(painted(before.clone(), 8, 8, 16, 16, 20), 40, 8, 16, 16, 20);
        assert_eq!(regions(&before, &near).0, vec![rect(8.0, 8.0, 48.0, 16.0)]);
    }

    #[test]
    fn a_change_inside_the_bounds_of_another_is_reported_with_it() {
        let before = flat(320, 320, 200);
        let mut after = painted(before.clone(), 152, 152, 16, 16, 20);
        for (x, y, w, h) in [
            (40, 40, 240, 8),
            (40, 272, 240, 8),
            (40, 40, 8, 240),
            (272, 40, 8, 240),
        ] {
            after = painted(after, x, y, w, h, 20);
        }
        assert_eq!(
            regions(&before, &after).0,
            vec![rect(40.0, 40.0, 240.0, 240.0)]
        );
    }

    #[test]
    fn text_is_compared_only_where_the_pixels_changed() {
        let before = [
            text("Save", 100.0, 200.0),
            text("Draft", 10.0, 40.0),
            text("Title", 10.0, 10.0),
        ];
        let after = [
            text("Saved", 100.0, 200.0),
            text("All changes saved", 100.0, 240.0),
            text("Tit1e", 10.0, 10.0),
        ];
        let changed = [rect(90.0, 190.0, 100.0, 80.0), rect(0.0, 36.0, 100.0, 24.0)];
        let dotted = [text("9:20 •", 100.0, 200.0)];
        assert_eq!(
            text_changes(&[text("9:20", 100.0, 200.0)], &dotted, &changed),
            vec![]
        );
        assert_eq!(
            text_changes(&before, &after, &changed),
            vec![
                TextChange::Removed {
                    text: "Draft".into(),
                    at: rect(10.0, 40.0, 60.0, 16.0)
                },
                TextChange::Changed {
                    from: "Save".into(),
                    to: "Saved".into(),
                    at: rect(100.0, 200.0, 60.0, 16.0)
                },
                TextChange::Added {
                    text: "All changes saved".into(),
                    at: rect(100.0, 240.0, 60.0, 16.0)
                },
            ]
        );
    }

    #[test]
    fn the_report_reads_like_a_snapshot_diff() {
        assert_eq!(render(&Report::default()), "same");
        let report = Report {
            regions: vec![rect(0.0, 36.0, 100.0, 24.0), rect(90.0, 190.0, 100.0, 80.0)],
            share: 0.0412,
            text: vec![
                TextChange::Changed {
                    from: "Save".into(),
                    to: "Saved".into(),
                    at: rect(100.0, 200.0, 60.0, 16.0),
                },
                TextChange::Added {
                    text: "All changes saved".into(),
                    at: rect(10.0, 240.0, 60.0, 16.0),
                },
            ],
            unread: None,
        };
        assert_eq!(
            render(&report),
            "changed: 2 regions, 4.1% of the screen\n\
             ~ \"Save\" → \"Saved\" at 130,208\n\
             + \"All changes saved\" at 40,248\n\
             region 0,36 100x24 (no text changed)"
        );
    }

    #[test]
    fn a_png_is_read_as_brightness_whatever_its_color_type() {
        let mut bytes = Vec::new();
        {
            let mut e = png::Encoder::new(&mut bytes, 2, 1);
            e.set_color(png::ColorType::Rgb);
            e.set_depth(png::BitDepth::Eight);
            let mut w = e.write_header().unwrap();
            w.write_image_data(&[255, 255, 255, 0, 0, 0]).unwrap();
        }
        let p = decode(&bytes).unwrap();
        assert_eq!((p.width, p.height, p.luma), (2, 1, vec![255, 0]));
        assert!(decode(b"not a png").is_err());
    }
}
