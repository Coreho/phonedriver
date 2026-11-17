#[cfg(any(target_os = "macos", windows))]
use std::time::Instant;

use phonedriver::ocr::recognize;
use phonedriver_core::geometry::Size;

const ANDROID: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../core/tests/fixtures/android/"
);
const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ocr/");
const IOS: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../testbeds/ios/screenshots/"
);

// GitHub's macOS runners are virtual machines: there Vision took 580 ms a frame and read "b0" as "bo" (CI run 42889844605).
#[cfg(any(target_os = "macos", windows))]
fn hosted_runner() -> bool {
    std::env::var_os("GITHUB_ACTIONS").is_some()
}

/// True on a Linux host with no `tesseract` to run, after checking that `recognize` says which package to install.
fn no_engine() -> bool {
    if cfg!(any(target_os = "macos", windows))
        || std::process::Command::new("tesseract")
            .arg("--version")
            .output()
            .is_ok()
    {
        return false;
    }
    let e = recognize(
        &read(&format!("{ANDROID}testbed_taps.png")),
        Size { w: 411.0, h: 923.0 },
    )
    .unwrap_err();
    assert!(e.to_string().contains("`tesseract-ocr`"), "{e}");
    true
}

fn read(path: &str) -> Vec<u8> {
    std::fs::read(path).unwrap()
}

fn texts(png: &[u8], w: f32, h: f32) -> Vec<String> {
    recognize(png, Size { w, h })
        .unwrap()
        .into_iter()
        .map(|b| b.text)
        .collect()
}

fn assert_finds(found: &[String], expected: &[&str]) {
    let missing: Vec<&&str> = expected
        .iter()
        .filter(|e| {
            !found
                .iter()
                .any(|f| f.to_lowercase().contains(&e.to_lowercase()))
        })
        .collect();
    assert!(missing.is_empty(), "missing {missing:?} in {found:?}");
}

/// Windows reads words well and two-character labels less well: it takes `b10` for `blO` and `b1` for `bl`.
#[cfg(windows)]
#[test]
fn windows_reads_the_words_of_the_taps_tab_and_most_of_its_short_labels() {
    for (file, least) in [
        (format!("{ANDROID}testbed_taps.png"), 15),
        (format!("{FIXTURES}testbed_taps_2x.png"), 15),
    ] {
        let found = texts(&read(&file), 411.0, 923.0);
        assert_finds(&found, &["Taps", "Text", "List", "Gestures", "Dark theme"]);
        let labels = (0..24)
            .filter(|i| found.iter().any(|f| *f == format!("b{i}")))
            .count();
        assert!(labels >= least, "{labels} of 24 labels in {found:?}");
    }
}

/// The same picture with every colour inverted: a dark theme.
#[cfg(not(any(target_os = "macos", windows)))]
fn inverted(png: &[u8]) -> Vec<u8> {
    let mut reader = png::Decoder::new(std::io::Cursor::new(png))
        .read_info()
        .unwrap();
    let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut pixels).unwrap();
    let channels = info.color_type.samples();
    for pixel in pixels.chunks_exact_mut(channels) {
        pixel[..3].iter_mut().for_each(|c| *c = 255 - *c);
    }
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, info.width, info.height);
    encoder.set_color(info.color_type);
    encoder.set_depth(info.bit_depth);
    encoder
        .write_header()
        .unwrap()
        .write_image_data(&pixels)
        .unwrap();
    out
}

/// Tesseract after the picture is cleaned up for it; as the picture comes it reads one of these 30 strings.
#[cfg(not(any(target_os = "macos", windows)))]
#[test]
fn tesseract_reads_the_taps_tab_light_and_dark_at_one_and_two_pixels_per_point() {
    if no_engine() {
        return;
    }
    let one = read(&format!("{ANDROID}testbed_taps.png"));
    let two = read(&format!("{FIXTURES}testbed_taps_2x.png"));
    for (name, png) in [
        ("light", one.clone()),
        ("dark", inverted(&one)),
        ("light at two pixels a point", two.clone()),
        ("dark at two pixels a point", inverted(&two)),
    ] {
        let found = texts(&png, 411.0, 923.0);
        assert_finds(
            &found,
            &["Taps", "Text", "List", "Gestures", "Busy", "Dark theme"],
        );
        let labels = (0..24)
            .filter(|i| found.iter().any(|f| *f == format!("b{i}")))
            .count();
        assert!(labels >= 21, "{name}: {labels} of 24 labels in {found:?}");
    }
}

/// Vision on four pictures: the testbed's taps tab at one and two pixels a point, Android's Settings and the iOS
/// testbed's gestures tab.
#[cfg(target_os = "macos")]
#[test]
fn vision_reads_the_taps_tab_at_both_sizes_settings_and_the_ios_tab_bar() {
    let quick = |path: String, w: f32, h: f32| -> Vec<phonedriver_core::ocr::TextBox> {
        recognize(&read(&path), Size { w, h }).unwrap()
    };
    let words = |boxes: &[phonedriver_core::ocr::TextBox]| -> Vec<String> {
        boxes.iter().map(|b| b.text.clone()).collect()
    };
    for (file, least) in [
        (format!("{ANDROID}testbed_taps.png"), 22),
        (format!("{FIXTURES}testbed_taps_2x.png"), 19),
    ] {
        let boxes = quick(file, 411.0, 923.0);
        let found = words(&boxes);
        assert_finds(&found, &["Taps", "Text", "List", "Gestures", "Dark theme"]);
        let labels = (0..24)
            .filter(|i| found.iter().any(|f| *f == format!("b{i}")))
            .count();
        assert!(labels >= least, "{labels} of 24 labels in {found:?}");
        let dark = boxes
            .iter()
            .find(|b| b.text.contains("Dark theme"))
            .expect("Dark theme");
        assert!(
            dark.bounds.x.abs() < 8.0 && (dark.bounds.y + dark.bounds.h / 2.0 - 116.0).abs() < 8.0,
            "{dark:?}"
        );
    }
    let settings = words(&quick(
        format!("{ANDROID}real_settings_main.png"),
        411.4,
        923.4,
    ));
    assert_finds(
        &settings,
        &[
            "Search Settings",
            "Network & internet",
            "Connected devices",
            "Notification history, conversations",
            "Do Not Disturb, Bedtime, Driving",
            "Colors, themed icons, app grid",
            "Storage",
        ],
    );
    let ios = words(&quick(format!("{IOS}gestures.png"), 402.0, 874.0));
    assert_finds(&ios, &["Gesture pad", "Gestures", "Secure", "Dialogs"]);
}

#[test]
fn android_settings() {
    if no_engine() {
        return;
    }
    let found = texts(
        &read(&format!("{ANDROID}real_settings_main.png")),
        411.4,
        923.4,
    );
    assert_finds(
        &found,
        &[
            "Search Settings",
            "Google",
            "Services & preferences",
            "Network & internet",
            "Connected devices",
            "Bluetooth, pairing",
            "Apps",
            "Notifications",
            "Notification history, conversations",
            "Sound & vibration",
            "Volume and haptics",
            "Modes",
            "Do Not Disturb, Bedtime, Driving",
            "Display & touch",
            "Wallpaper & style",
            "Colors, themed icons, app grid",
            "Storage",
        ],
    );
}

#[test]
fn the_ios_testbed_gestures_canvas_and_tab_bar() {
    if no_engine() {
        return;
    }
    let found = texts(&read(&format!("{IOS}gestures.png")), 402.0, 874.0);
    assert_finds(
        &found,
        &["16:36", "Gesture pad", "Gestures", "Secure", "Dialogs"],
    );
}

#[test]
fn boxes_are_in_points_with_the_origin_at_the_top_left() {
    if no_engine() {
        return;
    }
    let boxes = recognize(
        &read(&format!("{ANDROID}testbed_taps.png")),
        Size { w: 411.0, h: 923.0 },
    )
    .unwrap();
    let dark = boxes
        .iter()
        .find(|b| b.text.contains("Dark theme"))
        .expect("Dark theme");
    assert!(
        (dark.bounds.x - 0.0).abs() < 8.0 && dark.bounds.w > 60.0 && dark.bounds.w < 110.0,
        "{dark:?}"
    );
    assert!(
        (dark.bounds.y + dark.bounds.h / 2.0 - 116.0).abs() < 8.0,
        "{dark:?}"
    );
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn a_frame_of_412_by_915_takes_under_120_ms_at_the_median() {
    if hosted_runner() {
        return;
    }
    let png = read(&format!("{ANDROID}testbed_taps.png"));
    let size = Size { w: 411.0, h: 923.0 };
    for _ in 0..3 {
        recognize(&png, size).unwrap();
    }
    let mut ms: Vec<f64> = (0..30)
        .map(|_| {
            let t = Instant::now();
            recognize(&png, size).unwrap();
            t.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    ms.sort_by(f64::total_cmp);
    eprintln!(
        "p50 {:.1} ms, min {:.1}, max {:.1}, 30 runs",
        ms[15], ms[0], ms[29]
    );
    assert!(ms[15] < 120.0, "p50 {:.1} ms", ms[15]);
}

#[test]
fn a_screenshot_vision_cannot_read_is_unsupported_and_points_to_screenshot() {
    let e = recognize(b"not a png", Size { w: 100.0, h: 100.0 }).unwrap_err();
    assert!(
        matches!(
            e,
            phonedriver_core::error::Error::Unsupported {
                op: phonedriver_core::error::Op::Ocr,
                ..
            }
        ),
        "{e:?}"
    );
    assert!(e.hint().contains("screenshot"), "{}", e.hint());
}
