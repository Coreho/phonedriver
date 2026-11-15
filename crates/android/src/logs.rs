//! Reading an app's lines and crashes out of `logcat -v brief` text.

/// The commands `Device::logs` runs. `-T` takes the device's own clock as epoch seconds, so the window is counted
/// back from `date` on the device. The crash buffer holds every app's crashes; an app's other lines are picked by
/// its uid, which outlives the process that crashed.
pub fn crash_command(seconds: u64) -> String {
    format!("logcat -b crash -d -v brief -T \"$(( $(date +%s) - {seconds} )).000\"")
}

pub fn app_command(package: &str, seconds: u64) -> String {
    format!(
        "U=$(pm list packages -U {package} | sed -n 's/^package:{package} uid://p'); [ -n \"$U\" ] && logcat -d -v brief --uid=$U -T \"$(( $(date +%s) - {seconds} )).000\""
    )
}

fn message(line: &str) -> Option<(&str, &str)> {
    let (head, text) = line.split_once("): ")?;
    let (_, pid) = head.split_once('(')?;
    Some((pid.trim(), text))
}

/// The last crash of `package` in the crash buffer: its exception line, then the first stack frame in the app's own
/// code, or the first frame when none is.
pub fn crash_of(log: &str, package: &str) -> Option<String> {
    let lines: Vec<(&str, &str)> = log.lines().filter_map(message).collect();
    let marker = format!("Process: {package}, PID:");
    let at = lines
        .iter()
        .rposition(|(_, text)| text.starts_with(&marker))?;
    let pid = lines[at].0;
    let mut block = lines[at + 1..]
        .iter()
        .take_while(|(p, text)| *p == pid && !text.starts_with("FATAL EXCEPTION"))
        .map(|(_, text)| *text);
    let exception = block.next()?.trim();
    let frames: Vec<&str> = block
        .filter_map(|text| text.trim().strip_prefix("at "))
        .collect();
    let own = format!("{package}.");
    let frame = frames
        .iter()
        .find(|f| f.starts_with(&own))
        .or(frames.first());
    Some(match frame {
        Some(frame) => format!("{exception} at {frame}"),
        None => exception.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ADB_CRASH: &str = "--------- beginning of crash
E/AndroidRuntime( 8476): FATAL EXCEPTION: main
E/AndroidRuntime( 8476): Process: dev.phonedriver.testbed, PID: 8476
E/AndroidRuntime( 8476): android.app.RemoteServiceException$CrashedByAdbException: shell-induced crash
E/AndroidRuntime( 8476): \tat android.app.ActivityThread.throwRemoteServiceException(ActivityThread.java:2581)
E/AndroidRuntime( 8476): \tat android.os.Handler.dispatchMessage(Handler.java:125)
";

    const APP_CRASH: &str = "E/AndroidRuntime( 100): FATAL EXCEPTION: main
E/AndroidRuntime( 100): Process: com.other.app, PID: 100
E/AndroidRuntime( 100): java.lang.NullPointerException: other
E/AndroidRuntime( 100): \tat com.other.app.Main.run(Main.kt:3)
E/AndroidRuntime( 222): FATAL EXCEPTION: main
E/AndroidRuntime( 222): Process: com.example, PID: 222
E/AndroidRuntime( 222): java.lang.IllegalStateException: boom
E/AndroidRuntime( 222): \tat android.view.View.performClick(View.java:8000)
E/AndroidRuntime( 222): \tat com.example.Main.onClick(Main.kt:12)
E/AndroidRuntime( 222): \tat com.example.Main.other(Main.kt:40)
";

    #[test]
    fn a_crash_is_its_exception_and_the_first_frame_in_the_apps_own_code() {
        assert_eq!(
            crash_of(APP_CRASH, "com.example").as_deref(),
            Some("java.lang.IllegalStateException: boom at com.example.Main.onClick(Main.kt:12)")
        );
        assert_eq!(
            crash_of(APP_CRASH, "com.other.app").as_deref(),
            Some("java.lang.NullPointerException: other at com.other.app.Main.run(Main.kt:3)")
        );
    }

    #[test]
    fn a_crash_with_no_frame_of_the_app_names_the_first_frame() {
        assert_eq!(
            crash_of(ADB_CRASH, "dev.phonedriver.testbed").as_deref(),
            Some(
                "android.app.RemoteServiceException$CrashedByAdbException: shell-induced crash at android.app.ActivityThread.throwRemoteServiceException(ActivityThread.java:2581)"
            )
        );
    }

    #[test]
    fn another_apps_crash_and_an_empty_buffer_are_no_crash() {
        assert_eq!(crash_of(APP_CRASH, "com.example.sibling"), None);
        assert_eq!(crash_of(ADB_CRASH, "com.example"), None);
        assert_eq!(
            crash_of("--------- beginning of crash\n", "com.example"),
            None
        );
    }

    #[test]
    fn the_app_command_picks_lines_by_the_apps_uid() {
        let c = app_command("com.example", 61);
        assert!(c.contains("pm list packages -U com.example"), "{c}");
        assert!(c.contains("--uid=$U"), "{c}");
        assert!(c.contains("- 61 )).000"), "{c}");
    }
}
