//! Text recognition in screenshots (architecture section 9): Apple Vision on macOS, the OCR engine Windows ships
//! (`Windows.Media.Ocr`) on Windows, and the `tesseract` program on Linux when it is installed. All three run on
//! this machine and send nothing anywhere.
//!
//! Vision hands back normalized boxes with the origin at the bottom left. `boundingBox` and the Core Image calls
//! that enlarge a picture are declared `unsafe` by the `objc2` crates, so this module allows unsafe code for those
//! and nothing else.

#![cfg_attr(target_os = "macos", allow(unsafe_code))]

use phonedriver_core::error::Error;
use phonedriver_core::error::Op;
use phonedriver_core::geometry::Size;
use phonedriver_core::ocr::TextBox;

/// Recognizes text in `png`, a screenshot of a screen `screen` points large, at Vision's Fast level.
///
/// With the picture enlarged to about three pixels a point, the Fast level reads all 30 strings of the testbed's taps
/// tab, 23 of its 24 two-character labels exact (the Accurate level: 24), in about 20 ms on an M4 Pro. The Accurate
/// level needs a model that macOS 27.0.1 compiles on a process's first call: 28 s on an M4 Pro, and on a Mac mini
/// whose compiled models are never cached it failed every process's first call after 12 to 17 s (decision D88).
#[cfg(target_os = "macos")]
pub fn recognize(png: &[u8], screen: Size) -> Result<Vec<TextBox>, Error> {
    use objc2::AnyThread;
    use objc2::rc::{Retained, autoreleasepool};
    use objc2::runtime::AnyObject;
    use objc2_core_foundation::CGAffineTransform;
    use objc2_core_image::CIImage;
    use objc2_foundation::{NSArray, NSData, NSDictionary};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequestTextRecognitionLevel,
    };
    use phonedriver_core::geometry::Rect;

    const UNREADABLE: Error = Error::Unsupported {
        op: Op::Ocr,
        reason: "Apple Vision could not read this screenshot",
    };
    autoreleasepool(|_| {
        let request = VNRecognizeTextRequest::new();
        request.setUsesLanguageCorrection(false);
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Fast);
        let data = NSData::with_bytes(png);
        let image = unsafe { CIImage::imageWithData(&data) }.ok_or(UNREADABLE)?;
        let across = unsafe { image.extent() }.size.width.max(1.0);
        let enlarge = (3.0 * f64::from(screen.w) / across).round().clamp(1.0, 3.0);
        let image = unsafe {
            image.imageByApplyingTransform(CGAffineTransform {
                a: enlarge,
                b: 0.0,
                c: 0.0,
                d: enlarge,
                tx: 0.0,
                ty: 0.0,
            })
        };
        let options: Retained<NSDictionary<_, AnyObject>> = NSDictionary::new();
        let handler = unsafe {
            VNImageRequestHandler::initWithCIImage_options(
                VNImageRequestHandler::alloc(),
                &image,
                &options,
            )
        };
        let requests = NSArray::from_retained_slice(&[request.clone().into_super().into_super()]);
        handler
            .performRequests_error(&requests)
            .map_err(|_| UNREADABLE)?;
        let Some(results) = request.results() else {
            return Ok(Vec::new());
        };
        Ok(results
            .iter()
            .filter_map(|o| {
                let top = o.topCandidates(1).firstObject()?;
                let b = unsafe { o.boundingBox() };
                let (w, h) = (f64::from(screen.w), f64::from(screen.h));
                Some(TextBox {
                    text: top.string().to_string(),
                    bounds: Rect {
                        x: (b.origin.x * w) as f32,
                        y: ((1.0 - b.origin.y - b.size.height) * h) as f32,
                        w: (b.size.width * w) as f32,
                        h: (b.size.height * h) as f32,
                    },
                    confidence: top.confidence(),
                })
            })
            .collect())
    })
}

/// Recognizes text in `png`, a screenshot of a screen `screen` points large, one box for each line Windows finds.
/// The engine reads the languages of the user's Windows profile and gives no confidence, so every box says 1.
#[cfg(windows)]
pub fn recognize(png: &[u8], screen: Size) -> Result<Vec<TextBox>, Error> {
    use phonedriver_core::geometry::Rect;
    use windows::Graphics::Imaging::{
        BitmapAlphaMode, BitmapDecoder, BitmapInterpolationMode, BitmapPixelFormat,
        BitmapTransform, ColorManagementMode, ExifOrientationMode,
    };
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

    /// Measured on the testbed's taps tab at one pixel per point (24 two-character button labels and 6 words):
    /// 20 strings read as they are, 25 enlarged twice, 22 enlarged three times, in 37 ms and 71 ms a frame.
    const ENLARGE: u32 = 2;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| Error::Unsupported {
        op: Op::Ocr,
        reason: "Windows has no text recognition for this account's languages; add a language with OCR in Settings, Time & language",
    })?;
    let read = || -> windows::core::Result<Vec<TextBox>> {
        let stream = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&stream)?;
        writer.WriteBytes(png)?;
        writer.StoreAsync()?.join()?;
        writer.DetachStream()?;
        stream.Seek(0)?;
        let decoder = BitmapDecoder::CreateAsync(&stream)?.join()?;
        let (w, h) = (decoder.PixelWidth()?, decoder.PixelHeight()?);
        let enlarge = (OcrEngine::MaxImageDimension()? / w.max(h).max(1)).clamp(1, ENLARGE);
        let transform = BitmapTransform::new()?;
        transform.SetScaledWidth(w * enlarge)?;
        transform.SetScaledHeight(h * enlarge)?;
        transform.SetInterpolationMode(BitmapInterpolationMode::Cubic)?;
        let bitmap = decoder
            .GetSoftwareBitmapTransformedAsync(
                BitmapPixelFormat::Bgra8,
                BitmapAlphaMode::Premultiplied,
                &transform,
                ExifOrientationMode::IgnoreExifOrientation,
                ColorManagementMode::DoNotColorManage,
            )?
            .join()?;
        let (across, down) = (
            screen.w / bitmap.PixelWidth()? as f32,
            screen.h / bitmap.PixelHeight()? as f32,
        );
        let mut boxes = Vec::new();
        for line in engine.RecognizeAsync(&bitmap)?.join()?.Lines()? {
            let (mut left, mut top, mut right, mut bottom) = (f32::MAX, f32::MAX, 0f32, 0f32);
            for word in line.Words()? {
                let r = word.BoundingRect()?;
                left = left.min(r.X);
                top = top.min(r.Y);
                right = right.max(r.X + r.Width);
                bottom = bottom.max(r.Y + r.Height);
            }
            if right <= left {
                continue;
            }
            boxes.push(TextBox {
                text: line.Text()?.to_string(),
                bounds: Rect {
                    x: left * across,
                    y: top * down,
                    w: (right - left) * across,
                    h: (bottom - top) * down,
                },
                confidence: 1.0,
            });
        }
        Ok(boxes)
    };
    read().map_err(|_| Error::Unsupported {
        op: Op::Ocr,
        reason: "Windows could not read this screenshot",
    })
}

/// Recognizes text in `png`, a screenshot of a screen `screen` points large, with the `tesseract` program when it is
/// installed. Linux ships no engine; this one is a package away and runs on this machine.
///
/// Tesseract reads pages, not screens. On the testbed's taps tab (24 grey buttons and 6 words) it read 1 of the 30
/// strings as the picture comes, at every page mode and size tried, and none with the colours inverted. So the
/// picture is enlarged to three pixels a point and then each pixel is replaced by how far it is from the average
/// of the 16 points around it ([`text_on_white`]): text comes out dark on white whatever the theme, and fills and
/// soft edges vanish. After that Tesseract read 29 of the 30, light and dark.
#[cfg(not(any(target_os = "macos", windows)))]
pub fn recognize(png: &[u8], screen: Size) -> Result<Vec<TextBox>, Error> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    const UNREADABLE: Error = Error::Unsupported {
        op: Op::Ocr,
        reason: "Tesseract could not read this screenshot",
    };
    let (gray, w, h) = gray(png).ok_or(UNREADABLE)?;
    let enlarge = ((3.0 * screen.w / w as f32).round() as usize).clamp(1, 3);
    let (page, w, h) = (enlarged(&gray, w, h, enlarge), w * enlarge, h * enlarge);
    let per_point = w as f32 / screen.w;
    let page = text_on_white(&page, w, h, (16.0 * per_point) as usize);
    let mut tesseract = Command::new("tesseract")
        .args(["stdin", "stdout", "--psm", "11", "tsv"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Error::Unsupported {
            op: Op::Ocr,
            reason: "text recognition on Linux uses Tesseract, which is not installed: install the `tesseract-ocr` package",
        })?;
    if let Some(mut stdin) = tesseract.stdin.take() {
        let _ = stdin
            .write_all(format!("P5\n{w} {h}\n255\n").as_bytes())
            .and_then(|()| stdin.write_all(&page));
    }
    let out = tesseract.wait_with_output().map_err(|_| UNREADABLE)?;
    if !out.status.success() {
        return Err(UNREADABLE);
    }
    Ok(phonedriver_core::ocr::from_tesseract_tsv(
        &String::from_utf8_lossy(&out.stdout),
        per_point,
    ))
}

/// The brightness of each pixel of an 8-bit RGB or RGBA PNG, with its width and height.
#[cfg(not(any(target_os = "macos", windows)))]
fn gray(png: &[u8]) -> Option<(Vec<u8>, usize, usize)> {
    let mut reader = png::Decoder::new(std::io::Cursor::new(png))
        .read_info()
        .ok()?;
    let mut buf = vec![0; reader.output_buffer_size()?];
    let info = reader.next_frame(&mut buf).ok()?;
    let channels = match (info.color_type, info.bit_depth) {
        (png::ColorType::Rgb, png::BitDepth::Eight) => 3,
        (png::ColorType::Rgba, png::BitDepth::Eight) => 4,
        _ => return None,
    };
    let (w, h) = (info.width as usize, info.height as usize);
    let gray = buf[..w * h * channels]
        .chunks_exact(channels)
        .map(|p| ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8)
        .collect();
    Some((gray, w, h))
}

/// `gray` enlarged `by` times each way, each new pixel a blend of the four it lies between.
#[cfg(not(any(target_os = "macos", windows)))]
fn enlarged(gray: &[u8], w: usize, h: usize, by: usize) -> Vec<u8> {
    if by == 1 {
        return gray.to_vec();
    }
    let place = |i: usize, len: usize| {
        let at = ((2 * i + 1) * 128 / by).saturating_sub(128);
        let low = (at / 256).min(len - 1);
        (low, (low + 1).min(len - 1), (at % 256) as u32)
    };
    let columns: Vec<(usize, usize, u32)> = (0..w * by).map(|x| place(x, w)).collect();
    let mut out = Vec::with_capacity(w * by * h * by);
    for y in 0..h * by {
        let (top, bottom, down) = place(y, h);
        let (top, bottom) = (&gray[top * w..][..w], &gray[bottom * w..][..w]);
        out.extend(columns.iter().map(|&(left, right, across)| {
            let upper = top[left] as u32 * (256 - across) + top[right] as u32 * across;
            let lower = bottom[left] as u32 * (256 - across) + bottom[right] as u32 * across;
            ((upper * (256 - down) + lower * down) >> 16) as u8
        }));
    }
    out
}

/// Each pixel as its distance from the mean of the square of `radius` pixels around it, drawn dark on white:
/// 24 levels or fewer are white, and three times the rest is the darkness.
#[cfg(not(any(target_os = "macos", windows)))]
fn text_on_white(gray: &[u8], w: usize, h: usize, radius: usize) -> Vec<u8> {
    let mut sums = vec![0u32; (w + 1) * (h + 1)];
    for y in 0..h {
        let mut row = 0u32;
        for x in 0..w {
            row += gray[y * w + x] as u32;
            sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row;
        }
    }
    let mut out = Vec::with_capacity(w * h);
    for y in 0..h {
        let (top, bottom) = (y.saturating_sub(radius), (y + radius + 1).min(h));
        for x in 0..w {
            let (left, right) = (x.saturating_sub(radius), (x + radius + 1).min(w));
            let sum = sums[bottom * (w + 1) + right] + sums[top * (w + 1) + left]
                - sums[top * (w + 1) + right]
                - sums[bottom * (w + 1) + left];
            let mean = sum / ((bottom - top) * (right - left)) as u32;
            let away = (gray[y * w + x] as u32).abs_diff(mean);
            out.push(255 - (away.saturating_sub(24) * 3).min(255) as u8);
        }
    }
    out
}
