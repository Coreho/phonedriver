//! Text found in pixels, and its merge into a snapshot taken from the accessibility tree.

use serde::{Deserialize, Serialize};

use crate::element::{Actions, Element, ElementState, Ref, Role, Source};
use crate::geometry::Rect;
use crate::render::Rendered;

/// Share of an OCR box that must lie inside a tree element with the same text for the two to be one thing.
const SAME_INSIDE: f32 = 0.5;

/// A line of text recognized in a screenshot, in logical points of the current orientation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextBox {
    pub text: String,
    pub bounds: Rect,
    pub confidence: f32,
}

fn inside(b: Rect, element: Rect) -> f32 {
    b.clip(element).map_or(0.0, |i| i.area() / b.area())
}

fn same_text(a: &str, b: &str) -> bool {
    a.trim().to_lowercase() == b.trim().to_lowercase()
}

/// A tree element says what the box says when its label, value or hint is the box's text and the box lies in it.
/// Observed on Settings (API 37): a row is several times the size of its title, so a rule that asked the two boxes
/// to overlap as equals listed every title twice, and a tap by that text was refused as ambiguous.
fn already_in_tree(tree: &[Element], b: &TextBox) -> bool {
    tree.iter().any(|e| {
        inside(b.bounds, e.bounds) > SAME_INSIDE
            && [e.label.as_deref(), e.value.as_deref(), e.hint.as_deref()]
                .into_iter()
                .flatten()
                .any(|t| same_text(t, &b.text))
    })
}

/// True when the tree says too little to act on: nothing at all, or a web view with no children.
pub fn tree_is_hollow(rendered: &Rendered) -> bool {
    rendered.elements.is_empty()
        || rendered
            .elements
            .iter()
            .any(|e| e.role == Role::WebView && e.children.is_empty())
}

/// Appends the boxes the tree does not already show as `Source::Ocr` text elements, in reading order.
/// `new_ref` names each one; it is called once per kept box.
pub fn merge(
    rendered: &mut Rendered,
    boxes: Vec<TextBox>,
    mut new_ref: impl FnMut(&TextBox) -> Ref,
) {
    let mut kept: Vec<TextBox> = boxes
        .into_iter()
        .filter(|b| !b.text.trim().is_empty() && !already_in_tree(&rendered.elements, b))
        .collect();
    kept.sort_by(|a, b| {
        (a.bounds.y, a.bounds.x)
            .partial_cmp(&(b.bounds.y, b.bounds.x))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for b in kept {
        rendered.elements.push(Element {
            r#ref: new_ref(&b),
            role: Role::Text,
            label: Some(b.text),
            value: None,
            hint: None,
            id: None,
            bounds: b.bounds,
            state: ElementState::ENABLED,
            actions: Actions::TAP,
            position: None,
            collection: None,
            source: Source::Ocr,
            children: Vec::new(),
        });
        rendered.parents.push(None);
    }
}

/// Below this a word Tesseract reports is left out. On the testbed's taps tab and the Settings screen every word
/// that was on the screen came back at 84 or more; icons read as text (`eee`, a lone quote mark) came back at 26
/// to 55.
const TESSERACT_SURE: f32 = 60.0;

/// The lines in Tesseract's TSV output (`tesseract … tsv`), one box for each line it found, in points: its pixel
/// coordinates divided by `per_point`. A line's confidence is the mean of its words', from 0 to 1.
pub fn from_tesseract_tsv(tsv: &str, per_point: f32) -> Vec<TextBox> {
    struct Line {
        key: [u32; 4],
        words: Vec<String>,
        sure: f32,
        left: f32,
        top: f32,
        right: f32,
        bottom: f32,
    }
    let mut lines: Vec<Line> = Vec::new();
    for row in tsv.lines() {
        let cols: Vec<&str> = row.split('\t').collect();
        let [
            "5",
            page,
            block,
            par,
            line,
            _,
            left,
            top,
            width,
            height,
            sure,
            text,
        ] = cols[..]
        else {
            continue;
        };
        let number = |s: &str| s.parse::<f32>().ok();
        let (Some(left), Some(top), Some(width), Some(height), Some(sure)) = (
            number(left),
            number(top),
            number(width),
            number(height),
            number(sure),
        ) else {
            continue;
        };
        if sure < TESSERACT_SURE || text.trim().is_empty() {
            continue;
        }
        let key = [page, block, par, line].map(|n| n.parse().unwrap_or(0));
        let (right, bottom) = (left + width, top + height);
        match lines.last_mut().filter(|l| l.key == key) {
            Some(l) => {
                l.words.push(text.to_string());
                l.sure += sure;
                l.left = l.left.min(left);
                l.top = l.top.min(top);
                l.right = l.right.max(right);
                l.bottom = l.bottom.max(bottom);
            }
            None => lines.push(Line {
                key,
                words: vec![text.to_string()],
                sure,
                left,
                top,
                right,
                bottom,
            }),
        }
    }
    lines
        .into_iter()
        .map(|l| TextBox {
            confidence: l.sure / l.words.len() as f32 / 100.0,
            text: l.words.join(" "),
            bounds: Rect {
                x: l.left / per_point,
                y: l.top / per_point,
                w: (l.right - l.left) / per_point,
                h: (l.bottom - l.top) / per_point,
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::{Filters, Header};

    fn rect(x: f32, y: f32, w: f32, h: f32) -> Rect {
        Rect { x, y, w, h }
    }

    fn tree_with(label: &str, bounds: Rect) -> Rendered {
        Rendered {
            header: Header::default(),
            elements: vec![Element {
                r#ref: Ref(1),
                role: Role::Button,
                label: Some(label.into()),
                value: None,
                hint: None,
                id: None,
                bounds,
                state: ElementState::ENABLED,
                actions: Actions::TAP,
                position: None,
                collection: None,
                source: Source::Tree,
                children: Vec::new(),
            }],
            parents: vec![None],
        }
    }

    fn text_box(text: &str, bounds: Rect) -> TextBox {
        TextBox {
            text: text.into(),
            bounds,
            confidence: 0.9,
        }
    }

    fn merged(mut r: Rendered, boxes: Vec<TextBox>) -> Rendered {
        let mut next = 10;
        merge(&mut r, boxes, |_| {
            next += 1;
            Ref(next)
        });
        r
    }

    #[test]
    fn a_tree_is_hollow_when_empty_or_a_web_view_has_no_children() {
        let mut r = tree_with("Wi-Fi", rect(0.0, 0.0, 10.0, 10.0));
        assert!(!tree_is_hollow(&r));
        r.elements[0].role = Role::WebView;
        assert!(tree_is_hollow(&r));
        r.elements[0].children.push(0);
        assert!(!tree_is_hollow(&r));
        r.elements.clear();
        assert!(tree_is_hollow(&r));
    }

    #[test]
    fn a_box_over_a_tree_element_with_the_same_text_is_dropped() {
        let r = merged(
            tree_with("Wi-Fi", rect(10.0, 10.0, 100.0, 40.0)),
            vec![text_box("WI-FI", rect(12.0, 14.0, 90.0, 30.0))],
        );
        assert_eq!(r.elements.len(), 1);
    }

    #[test]
    fn a_line_of_text_inside_a_row_that_says_it_is_dropped() {
        let mut row = tree_with("Network & internet", rect(16.0, 235.0, 380.0, 75.0));
        row.elements[0].hint = Some("Mobile, Wi-Fi, hotspot".into());
        let r = merged(
            row,
            vec![
                text_box("Network & internet", rect(84.0, 254.0, 130.0, 20.0)),
                text_box("Mobile, Wi-Fi, hotspot", rect(84.0, 276.0, 140.0, 16.0)),
                text_box("Sign in", rect(84.0, 290.0, 60.0, 16.0)),
            ],
        );
        let labels: Vec<_> = r.elements.iter().map(|e| e.label.as_deref()).collect();
        assert_eq!(labels, [Some("Network & internet"), Some("Sign in")]);
    }

    #[test]
    fn a_box_with_other_text_over_a_tree_element_is_kept() {
        let r = merged(
            tree_with("Wi-Fi", rect(10.0, 10.0, 100.0, 40.0)),
            vec![text_box("Bluetooth", rect(12.0, 14.0, 90.0, 30.0))],
        );
        assert_eq!(r.elements.len(), 2);
    }

    #[test]
    fn the_same_text_elsewhere_is_kept() {
        let r = merged(
            tree_with("Wi-Fi", rect(10.0, 10.0, 100.0, 40.0)),
            vec![text_box("Wi-Fi", rect(10.0, 300.0, 100.0, 40.0))],
        );
        assert_eq!(r.elements.len(), 2);
    }

    #[test]
    fn a_box_that_barely_overlaps_is_kept() {
        let r = merged(
            tree_with("Wi-Fi", rect(0.0, 0.0, 100.0, 40.0)),
            vec![text_box("Wi-Fi", rect(60.0, 0.0, 100.0, 40.0))],
        );
        assert_eq!(r.elements.len(), 2);
    }

    #[test]
    fn kept_boxes_become_ocr_elements_in_reading_order_with_refs() {
        let r = merged(
            Rendered {
                header: Header::default(),
                elements: vec![],
                parents: vec![],
            },
            vec![
                text_box("Second", rect(10.0, 200.0, 80.0, 20.0)),
                text_box("   ", rect(10.0, 50.0, 80.0, 20.0)),
                text_box("First", rect(10.0, 100.0, 80.0, 20.0)),
            ],
        );
        let text = r.text(&Filters::default()).unwrap();
        assert!(
            text.ends_with("@e11 text \"First\" (ocr)\n@e12 text \"Second\" (ocr)"),
            "{text}"
        );
        assert!(r.elements.iter().all(|e| e.source == Source::Ocr));
    }

    #[test]
    fn tesseract_words_become_one_box_a_line_in_points_and_unsure_words_are_left_out() {
        let tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
            1\t1\t0\t0\t0\t0\t0\t0\t1233\t2769\t-1\t\n\
            4\t1\t5\t1\t1\t0\t1143\t220\t90\t40\t-1\t\n\
            5\t1\t5\t1\t1\t1\t1143\t220\t90\t40\t96\tBusy\n\
            5\t1\t6\t1\t1\t1\t3\t327\t106\t42\t96\tDark\n\
            5\t1\t6\t1\t1\t2\t125\t327\t148\t42\t90\ttheme\n\
            5\t1\t7\t1\t1\t1\t1163\t318\t58\t58\t49\t\u{201d}\n\
            5\t1\t8\t1\t1\t1\t132\t565\t44\t32\t55\tbo\n\
            5\t1\t9\t1\t1\t1\t440\t564\t39\t33\t90\tb1\n\
            5\t1\t10\t1\t1\t1\t10\t10\t5\t5\t95\t \n";
        let boxes = from_tesseract_tsv(tsv, 3.0);
        let texts: Vec<&str> = boxes.iter().map(|b| b.text.as_str()).collect();
        assert_eq!(texts, ["Busy", "Dark theme", "b1"]);
        assert_eq!(boxes[1].bounds, rect(1.0, 109.0, 90.0, 14.0));
        assert!((boxes[1].confidence - 0.93).abs() < 1e-6, "{boxes:?}");
        assert_eq!(boxes[2].bounds, rect(440.0 / 3.0, 188.0, 13.0, 11.0));
    }
}
