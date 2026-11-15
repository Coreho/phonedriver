//! Text recognition in screenshots (architecture section 9): Apple Vision on macOS, the OCR engine Windows ships
//! (`Windows.Media.Ocr`) on Windows. Both run on this machine and send nothing anywhere.
//!
//! Vision hands back normalized boxes with the origin at the bottom left. `boundingBox` and `setRevision` are
//! the Vision calls `objc2-vision` declares `unsafe`, so this module allows unsafe code for those two and nothing else.

#![cfg_attr(target_os = "macos", allow(unsafe_code))]

use phonedriver_core::error::Error;
use phonedriver_core::error::Op;
use phonedriver_core::geometry::Size;
use phonedriver_core::ocr::TextBox;

/// Recognizes text in `png`, a screenshot of a screen `screen` points large.
#[cfg(target_os = "macos")]
pub fn recognize(png: &[u8], screen: Size) -> Result<Vec<TextBox>, Error> {
    use objc2::AnyThread;
    use objc2::rc::{Retained, autoreleasepool};
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSArray, NSData, NSDictionary};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequestTextRecognitionLevel,
    };
    use phonedriver_core::geometry::Rect;

    autoreleasepool(|_| {
        let request = VNRecognizeTextRequest::new();
        // Revisions 1 and 3 run the Accurate model on the Neural Engine, which on macOS 27.0.1 takes 18 to 36 s and
        // often fails with an e5rt error; revision 2 recognizes the same text in about 45 ms.
        unsafe { request.setRevision(2) };
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(false);
        let data = NSData::with_bytes(png);
        let options: Retained<NSDictionary<_, AnyObject>> = NSDictionary::new();
        let handler = VNImageRequestHandler::initWithData_options(
            VNImageRequestHandler::alloc(),
            &data,
            &options,
        );
        let requests = NSArray::from_retained_slice(&[request.clone().into_super().into_super()]);
        handler
            .performRequests_error(&requests)
            .map_err(|_| Error::Unsupported {
                op: Op::Ocr,
                reason: "Apple Vision could not read this screenshot",
            })?;
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

/// Recognizes text in `png`; Linux has no engine.
#[cfg(not(any(target_os = "macos", windows)))]
pub fn recognize(_png: &[u8], _screen: Size) -> Result<Vec<TextBox>, Error> {
    Err(Error::Unsupported {
        op: Op::Ocr,
        reason: "text recognition uses Apple Vision on macOS and Windows OCR on Windows; Linux has neither",
    })
}
