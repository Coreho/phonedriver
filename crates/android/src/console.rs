//! The console of an Android emulator: the control port it opens on the machine that runs it (5554 for
//! `emulator-5554`). It is how a test touches the emulated fingerprint sensor (decision D63). The console asks for
//! the token the emulator wrote to `.emulator_console_auth_token` in the home folder of whoever started it.
//!
//! The port listens on that machine's loopback only. From another machine it is reached from inside the emulator,
//! where the host's loopback is `10.0.2.2`.

use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

const ANSWER_WAIT: Duration = Duration::from_secs(3);
/// How long the finger stays on the sensor. The emulator reports a touch when the finger comes down.
const TOUCH: Duration = Duration::from_millis(200);

/// The console port of an emulator's serial, such as 5554 for `emulator-5554`.
pub fn port(serial: &str) -> Option<u16> {
    serial.strip_prefix("emulator-")?.parse().ok()
}

/// Opens the console at `addr` on this machine.
pub async fn connect(addr: &str) -> Result<TcpStream, String> {
    tokio::time::timeout(ANSWER_WAIT, TcpStream::connect(addr))
        .await
        .map_err(|_| format!("the emulator console at {addr} did not answer"))?
        .map_err(|e| format!("cannot reach the emulator console at {addr}: {e}"))
}

/// Touches the emulator's fingerprint sensor with finger `finger` and lifts it again. `token` is the content of
/// the token file, used only when the console asks for it.
pub async fn touch_sensor(addr: &str, token: Option<&str>, finger: u32) -> Result<(), String> {
    touch_sensor_on(connect(addr).await?, token, finger).await
}

/// `touch_sensor` over a connection to the console that is already open, such as one made from inside the
/// emulator when the console's machine is not this one.
pub async fn touch_sensor_on(
    console: impl AsyncRead + AsyncWrite + Unpin,
    token: Option<&str>,
    finger: u32,
) -> Result<(), String> {
    run_on(
        console,
        token,
        &[&format!("finger touch {finger}"), "finger remove"],
        TOUCH,
    )
    .await
    .map(drop)
}

/// Sends one console command, such as `geo fix -122.41 37.77`, and returns what the console said to it.
pub async fn command_on(
    console: impl AsyncRead + AsyncWrite + Unpin,
    token: Option<&str>,
    command: &str,
) -> Result<String, String> {
    run_on(console, token, &[command], Duration::ZERO).await
}

/// Authenticates when the console asks, then sends `commands` in order with `pause` between them, and returns
/// what the console said to the last one.
async fn run_on(
    console: impl AsyncRead + AsyncWrite + Unpin,
    token: Option<&str>,
    commands: &[&str],
    pause: Duration,
) -> Result<String, String> {
    let (read, mut write) = tokio::io::split(console);
    let mut lines = BufReader::new(read).lines();
    let mut answer = async |sent: Option<&str>| -> Result<String, String> {
        if let Some(line) = sent {
            write
                .write_all(format!("{line}\r\n").as_bytes())
                .await
                .map_err(|e| format!("the emulator console closed: {e}"))?;
        }
        let mut said = String::new();
        loop {
            let line = tokio::time::timeout(ANSWER_WAIT, lines.next_line())
                .await
                .map_err(|_| "the emulator console stopped answering".to_string())?
                .map_err(|e| format!("the emulator console closed: {e}"))?
                .ok_or("the emulator console closed")?;
            if line == "OK" {
                return Ok(said);
            }
            if let Some(why) = line.strip_prefix("KO:") {
                return Err(format!("the emulator console refused: {}", why.trim()));
            }
            said.push_str(&line);
            said.push('\n');
        }
    };
    let banner = answer(None).await?;
    if banner.contains("Authentication required") {
        let token = token
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or("the emulator console asks for a token: `.emulator_console_auth_token`, from the home folder of whoever started the emulator, has to be in the home folder here")?;
        answer(Some(&format!("auth {token}"))).await?;
    }
    let mut said = String::new();
    for (i, command) in commands.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(pause).await;
        }
        said = answer(Some(command)).await?;
    }
    Ok(said)
}

#[cfg(test)]
mod tests {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    use super::*;

    /// A console that greets with `banner`, answers each line it is sent with the next of `answers`, and returns
    /// the lines it was sent.
    async fn console(
        banner: &'static str,
        answers: &'static [&'static str],
    ) -> (String, tokio::task::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        let served = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let (read, mut write) = stream.into_split();
            write.write_all(banner.as_bytes()).await.unwrap();
            let mut lines = BufReader::new(read).lines();
            let mut got = Vec::new();
            for answer in answers {
                let Ok(Some(line)) = lines.next_line().await else {
                    break;
                };
                got.push(line);
                write.write_all(answer.as_bytes()).await.unwrap();
            }
            got
        });
        (addr, served)
    }

    const ASKS: &str = "Android Console: Authentication required\r\nAndroid Console: type 'auth <auth_token>' to authenticate\r\nAndroid Console: you can find your <auth_token> in \r\n'/Users/me/.emulator_console_auth_token'\r\nOK\r\n";

    #[test]
    fn the_port_is_the_number_in_an_emulators_serial() {
        assert_eq!(port("emulator-5554"), Some(5554));
        assert_eq!(port("R5CT123"), None);
        assert_eq!(port("192.168.1.4:5555"), None);
    }

    #[tokio::test]
    async fn a_touch_authenticates_then_puts_the_finger_down_and_lifts_it() {
        let (addr, served) = console(ASKS, &["OK\r\n", "OK\r\n", "OK\r\n"]).await;
        touch_sensor(&addr, Some("s3cr3t\n"), 1).await.unwrap();
        assert_eq!(
            served.await.unwrap(),
            ["auth s3cr3t", "finger touch 1", "finger remove"]
        );
    }

    #[tokio::test]
    async fn a_touch_goes_over_a_connection_that_is_already_open() {
        let (ours, theirs) = tokio::io::duplex(1024);
        let served = tokio::spawn(async move {
            let (read, mut write) = tokio::io::split(theirs);
            write.write_all(ASKS.as_bytes()).await.unwrap();
            let mut lines = BufReader::new(read).lines();
            let mut got = Vec::new();
            for _ in 0..3 {
                got.push(lines.next_line().await.unwrap().unwrap());
                write.write_all(b"OK\r\n").await.unwrap();
            }
            got
        });
        touch_sensor_on(ours, Some("s3cr3t"), 2).await.unwrap();
        assert_eq!(
            served.await.unwrap(),
            ["auth s3cr3t", "finger touch 2", "finger remove"]
        );
    }

    #[tokio::test]
    async fn a_console_that_asks_for_nothing_is_not_sent_a_token() {
        let (addr, served) = console(
            "Android Console: type 'help'\r\nOK\r\n",
            &["OK\r\n", "OK\r\n"],
        )
        .await;
        touch_sensor(&addr, None, 2).await.unwrap();
        assert_eq!(served.await.unwrap(), ["finger touch 2", "finger remove"]);
    }

    #[tokio::test]
    async fn a_command_answers_with_what_the_console_said_or_why_it_refused() {
        let (addr, served) = console(ASKS, &["OK\r\n", "Pixel_API_37\r\nOK\r\n"]).await;
        let stream = TcpStream::connect(&addr).await.unwrap();
        let said = command_on(stream, Some("s3cr3t"), "avd name")
            .await
            .unwrap();
        assert_eq!(said, "Pixel_API_37\n");
        assert_eq!(served.await.unwrap(), ["auth s3cr3t", "avd name"]);

        let (addr, _served) = console(
            "Android Console: type 'help'\r\nOK\r\n",
            &["KO: unknown command, try 'help'\r\n"],
        )
        .await;
        let stream = TcpStream::connect(&addr).await.unwrap();
        let e = command_on(stream, None, "geo fixx 1 2").await.unwrap_err();
        assert_eq!(
            e,
            "the emulator console refused: unknown command, try 'help'"
        );
    }

    #[tokio::test]
    async fn a_refusal_and_a_missing_token_say_what_is_wrong() {
        let (addr, _served) = console(ASKS, &["KO: authentication token does not match\r\n"]).await;
        let e = touch_sensor(&addr, Some("wrong"), 1).await.unwrap_err();
        assert!(e.contains("authentication token does not match"), "{e}");
        let (addr, _served) = console(ASKS, &[]).await;
        let e = touch_sensor(&addr, None, 1).await.unwrap_err();
        assert!(e.contains(".emulator_console_auth_token"), "{e}");
    }
}
