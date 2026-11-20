//! Reads the web page in front through the DevTools socket Chrome and debuggable web views open on the device
//! (decision D71). Read only: one fixed script is evaluated, and nothing is clicked or typed through it.

use std::time::Duration;

use phonedriver_core::device::{AppId, Result, WebPage};
use phonedriver_core::error::Error;
use serde_json::{Value, json};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::adb::Adb;
use crate::device::package_name;

const LIMIT: Duration = Duration::from_secs(8);
const TABS_ASKED: usize = 12;
const ANSWER_WAIT: Duration = Duration::from_millis(1500);
const LARGEST_ANSWER: u64 = 32 * 1024 * 1024;
const READ_PAGE: &str = "JSON.stringify({title: document.title, url: location.href, text: document.body ? document.body.innerText : ''})";
const IS_VISIBLE: &str = "document.visibilityState";

fn refused(detail: impl Into<String>) -> Error {
    Error::Refused {
        detail: detail.into(),
    }
}

fn broken(what: &str) -> Error {
    Error::Transport {
        detail: format!("the page's debugging socket {what}"),
    }
}

/// The abstract socket names in `/proc/net/unix` that are DevTools servers: `chrome_devtools_remote` for Chrome and
/// `webview_devtools_remote_<pid>` for an app's web views.
fn sockets(proc_net_unix: &str) -> Vec<String> {
    proc_net_unix
        .lines()
        .filter_map(|l| l.rsplit_once('@').map(|(_, name)| name.trim()))
        .filter(|name| name.contains("devtools_remote"))
        .map(str::to_string)
        .collect()
}

async fn get(adb: &Adb, serial: &str, socket: &str, path: &str) -> Result<Value> {
    let mut s = adb.open_abstract(serial, socket).await?;
    s.write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes())
        .await
        .map_err(|_| broken("closed"))?;
    let head = read_head(&mut s).await?;
    let length: u64 = head
        .lines()
        .find_map(|l| {
            let (name, value) = l.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse().ok())?
        })
        .filter(|n| *n <= LARGEST_ANSWER)
        .ok_or_else(|| broken("sent no usable length"))?;
    let mut body = vec![0; length as usize];
    s.read_exact(&mut body)
        .await
        .map_err(|_| broken("closed"))?;
    serde_json::from_slice(&body).map_err(|_| broken("did not answer in JSON"))
}

async fn read_head<S: AsyncRead + Unpin>(s: &mut S) -> Result<String> {
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        let byte = s.read_u8().await.map_err(|_| broken("closed"))?;
        head.push(byte);
        if head.len() > 16 * 1024 {
            return Err(broken("sent no end of headers"));
        }
    }
    Ok(String::from_utf8_lossy(&head).into_owned())
}

/// One text frame from the client, masked as RFC 6455 requires of a client.
fn frame(text: &str, mask: [u8; 4]) -> Vec<u8> {
    let data = text.as_bytes();
    let mut out = vec![0x81];
    match data.len() {
        n if n < 126 => out.push(0x80 | n as u8),
        n if n < 65536 => {
            out.push(0x80 | 126);
            out.extend_from_slice(&(n as u16).to_be_bytes());
        }
        n => {
            out.push(0x80 | 127);
            out.extend_from_slice(&(n as u64).to_be_bytes());
        }
    }
    out.extend_from_slice(&mask);
    out.extend(data.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
    out
}

async fn message<S: AsyncRead + Unpin>(s: &mut S) -> Result<String> {
    let closed = |_| broken("closed");
    let mut whole = Vec::new();
    loop {
        let first = s.read_u8().await.map_err(closed)?;
        let second = s.read_u8().await.map_err(closed)?;
        let length = match second & 0x7F {
            126 => u64::from(s.read_u16().await.map_err(closed)?),
            127 => s.read_u64().await.map_err(closed)?,
            n => u64::from(n),
        };
        if length.saturating_add(whole.len() as u64) > LARGEST_ANSWER {
            return Err(broken("sent more than a page can hold"));
        }
        let mut payload = vec![0; length as usize];
        s.read_exact(&mut payload).await.map_err(closed)?;
        match first & 0x0F {
            0x8 => return Err(broken("closed")),
            0x9 | 0xA => continue,
            _ => whole.extend(payload),
        }
        if first & 0x80 != 0 {
            return Ok(String::from_utf8_lossy(&whole).into_owned());
        }
    }
}

async fn evaluate<S: AsyncRead + AsyncWrite + Unpin>(
    s: &mut S,
    ws_path: &str,
    script: &str,
) -> Result<Value> {
    let closed = |_| broken("closed");
    let upgrade = format!(
        "GET {ws_path} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: cGhvbmVkcml2ZXItcGFnZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
    );
    s.write_all(upgrade.as_bytes()).await.map_err(closed)?;
    let head = read_head(s).await?;
    if !head.starts_with("HTTP/1.1 101") {
        return Err(broken("refused the connection"));
    }
    let mut mask = [0; 4];
    getrandom::fill(&mut mask).map_err(|_| broken("could not be written to"))?;
    let call = json!({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": true}});
    s.write_all(&frame(&call.to_string(), mask))
        .await
        .map_err(closed)?;
    loop {
        let reply: Value = serde_json::from_str(&message(s).await?)
            .map_err(|_| broken("did not answer in JSON"))?;
        if reply["id"] == 1 {
            return Ok(reply["result"]["result"]["value"].clone());
        }
    }
}

fn ws_path(target: &Value) -> Option<String> {
    let url = target["webSocketDebuggerUrl"].as_str()?;
    let at = url.find("/devtools/")?;
    Some(url[at..].to_string())
}

/// A web view says in its description whether it is on screen; a browser tab does not.
fn shown(target: &Value) -> Option<bool> {
    let about: Value = serde_json::from_str(target["description"].as_str()?).ok()?;
    Some(about["visible"].as_bool()? && about["attached"].as_bool().unwrap_or(true))
}

/// The DevTools socket of `front`: its own web view socket (named by process id), or else a browser's socket that
/// says it belongs to `front`. Other apps' sockets are not asked at all, and a browser gets `ANSWER_WAIT`: Android
/// freezes an app in the background, and a connection to a frozen app's socket never answers (seen on the API 37
/// emulator: with Chrome in the background the first read of the testbed's page used its whole 8 s on Chrome).
async fn socket_of(adb: &Adb, serial: &str, front: &AppId) -> Result<Option<String>> {
    package_name(front)?;
    let front = &front.0;
    let listed = adb
        .shell(
            serial,
            &format!("grep -a devtools_remote /proc/net/unix; echo pids; pidof {front}"),
        )
        .await?
        .stdout_text();
    let (unix, pids) = listed.split_once("pids").unwrap_or((&listed, ""));
    let mut names = sockets(unix);
    names.sort();
    names.dedup();
    let own = pids
        .split_whitespace()
        .map(|pid| format!("webview_devtools_remote_{pid}"))
        .find(|name| names.contains(name));
    if own.is_some() {
        return Ok(own);
    }
    for name in names
        .into_iter()
        .filter(|n| !n.starts_with("webview_devtools_remote_"))
    {
        let asked = tokio::time::timeout(ANSWER_WAIT, get(adb, serial, &name, "/json/version"));
        if let Ok(Ok(version)) = asked.await
            && version["Android-Package"] == *front
        {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

async fn read(adb: &Adb, serial: &str, front: &AppId) -> Result<WebPage> {
    let socket = socket_of(adb, serial, front).await?.ok_or_else(|| {
        let front = &front.0;
        refused(format!(
            "{front} has no web page that can be read now: a page open in Chrome can be, and a web view in an app that is a debug build"
        ))
    })?;
    let targets = get(adb, serial, &socket, "/json").await?;
    let pages: Vec<&Value> = targets
        .as_array()
        .into_iter()
        .flatten()
        .filter(|t| t["type"] == "page" && shown(t) != Some(false))
        .collect();
    for page in pages.iter().take(TABS_ASKED) {
        let Some(path) = ws_path(page) else { continue };
        if shown(page).is_none() {
            let mut s = adb.open_abstract(serial, &socket).await?;
            if evaluate(&mut s, &path, IS_VISIBLE).await? != "visible" {
                continue;
            }
        }
        let mut s = adb.open_abstract(serial, &socket).await?;
        let value = evaluate(&mut s, &path, READ_PAGE).await?;
        let read: Value = serde_json::from_str(value.as_str().unwrap_or_default())
            .map_err(|_| broken("returned no page"))?;
        return Ok(WebPage {
            title: read["title"].as_str().unwrap_or_default().to_string(),
            url: read["url"].as_str().unwrap_or_default().to_string(),
            text: read["text"].as_str().unwrap_or_default().to_string(),
        });
    }
    Err(refused(format!("{} shows no web page now", front.0)))
}

/// The web page `front` shows, whole.
pub async fn page(adb: &Adb, serial: &str, front: &AppId) -> Result<WebPage> {
    tokio::time::timeout(LIMIT, read(adb, serial, front))
        .await
        .map_err(|_| Error::Timeout {
            waited_ms: LIMIT.as_millis() as u32,
            condition: "the page's debugging socket to answer".into(),
        })?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_devtools_sockets_are_picked_out_of_the_kernels_list() {
        let seen =
            "0000000000000000: 00000002 00000000 00010000 0001 01 384244 @chrome_devtools_remote
0000000000000000: 00000002 00000000 00010000 0001 01 384667 @webview_devtools_remote_16156
0000000000000000: 00000002 00000000 00010000 0001 01  5121 @jdwp-control
0000000000000000: 00000003 00000000 00000000 0001 03 12345 /dev/socket/logdw";
        assert_eq!(
            sockets(seen),
            ["chrome_devtools_remote", "webview_devtools_remote_16156"]
        );
    }

    #[test]
    fn a_web_view_says_whether_it_is_on_screen_and_a_browser_tab_does_not() {
        let web_view = json!({"description": "{\"attached\":true,\"empty\":false,\"height\":2093,\"never_attached\":false,\"screenX\":0,\"screenY\":268,\"visible\":true,\"width\":1080}"});
        let hidden = json!({"description": "{\"attached\":true,\"visible\":false}"});
        let tab = json!({"description": "", "webSocketDebuggerUrl": "ws://127.0.0.1:9333/devtools/page/5"});
        assert_eq!(shown(&web_view), Some(true));
        assert_eq!(shown(&hidden), Some(false));
        assert_eq!(shown(&tab), None);
        assert_eq!(ws_path(&tab).as_deref(), Some("/devtools/page/5"));
    }

    fn server_frame(opcode: u8, last: bool, payload: &[u8]) -> Vec<u8> {
        let mut out = vec![opcode | if last { 0x80 } else { 0 }];
        match payload.len() {
            n if n < 126 => out.push(n as u8),
            n => {
                out.push(126);
                out.extend_from_slice(&(n as u16).to_be_bytes());
            }
        }
        out.extend_from_slice(payload);
        out
    }

    #[tokio::test]
    async fn a_script_is_sent_masked_and_its_value_read_from_a_reply_in_pieces() {
        let (mut ours, mut theirs) = tokio::io::duplex(64 * 1024);
        let long = "x".repeat(300);
        let reply =
            json!({"id": 1, "result": {"result": {"type": "string", "value": long}}}).to_string();
        let (first, second) = (
            reply.as_bytes()[..100].to_vec(),
            reply.as_bytes()[100..].to_vec(),
        );
        let server = tokio::spawn(async move {
            let head = read_head(&mut theirs).await.unwrap();
            assert!(head.starts_with("GET /devtools/page/5 HTTP/1.1"), "{head}");
            theirs
                .write_all(
                    b"HTTP/1.1 101 WebSocket Protocol Handshake\r\nUpgrade: WebSocket\r\n\r\n",
                )
                .await
                .unwrap();
            let first_byte = theirs.read_u8().await.unwrap();
            let second_byte = theirs.read_u8().await.unwrap();
            assert_eq!(first_byte, 0x81);
            assert_eq!(second_byte & 0x80, 0x80, "a client frame is masked");
            let length = match second_byte & 0x7F {
                126 => theirs.read_u16().await.unwrap() as usize,
                n => n as usize,
            };
            let mut mask = [0; 4];
            theirs.read_exact(&mut mask).await.unwrap();
            let mut sent = vec![0; length];
            theirs.read_exact(&mut sent).await.unwrap();
            let sent: Vec<u8> = sent
                .iter()
                .enumerate()
                .map(|(i, b)| b ^ mask[i % 4])
                .collect();
            let event = json!({"method": "Runtime.executionContextCreated"}).to_string();
            let mut out = server_frame(0x1, true, event.as_bytes());
            out.extend(server_frame(0x9, true, b""));
            out.extend(server_frame(0x1, false, &first));
            out.extend(server_frame(0x0, true, &second));
            theirs.write_all(&out).await.unwrap();
            String::from_utf8(sent).unwrap()
        });
        let value = evaluate(&mut ours, "/devtools/page/5", "document.title")
            .await
            .unwrap();
        assert_eq!(value, json!(long));
        let sent: Value = serde_json::from_str(&server.await.unwrap()).unwrap();
        assert_eq!(sent["method"], "Runtime.evaluate");
        assert_eq!(sent["params"]["expression"], "document.title");
    }

    #[test]
    fn a_long_frame_carries_its_length_in_eight_bytes() {
        let text = "y".repeat(70_000);
        let out = frame(&text, [1, 2, 3, 4]);
        assert_eq!(out[1], 0x80 | 127);
        assert_eq!(u64::from_be_bytes(out[2..10].try_into().unwrap()), 70_000);
        assert_eq!(out[14] ^ 1, b'y');
    }

    #[tokio::test]
    async fn a_frame_that_claims_more_bytes_than_fit_in_a_number_is_refused() {
        let mut sent = server_frame(0x1, false, b"x");
        sent.extend([0x0, 127]);
        sent.extend(u64::MAX.to_be_bytes());
        let error = message(&mut sent.as_slice()).await.unwrap_err();
        assert!(error.to_string().contains("more than a page"), "{error}");
    }
}
