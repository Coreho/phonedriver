//! `simio`: one finger's touches on a Simulator through its own HID port, not XCTest (decision D93), and its screen
//! as it is drawn. A tap through the runner took 330 ms of XCTest's event synthesis (iPhone 17 Simulator, iOS 26.5);
//! through the HID port it takes a few milliseconds. The helper is compiled from `ios-runner/SimIO/simio.m` with
//! Xcode's clang on first use.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use phonedriver_core::device::TimedPoint;
use phonedriver_core::error::Error;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};

const SOURCE: &str = include_str!("../../../ios-runner/SimIO/simio.m");

pub type Result<T> = std::result::Result<T, Error>;

pub struct SimIo {
    _child: Child,
    stdin: ChildStdin,
    stdout: Lines<BufReader<ChildStdout>>,
}

fn hash() -> String {
    Sha256::digest(SOURCE.as_bytes())[..8]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn failed(detail: String) -> Error {
    Error::Transport { detail }
}

/// Compiles the helper once per source hash under `<home>/simio/<hash>`, removing the builds of other sources.
async fn build(home: &Path) -> Result<PathBuf> {
    let hash = hash();
    let root = home.join("simio");
    let dir = root.join(&hash);
    let exe = dir.join("simio");
    if exe.is_file() {
        return Ok(exe);
    }
    std::fs::create_dir_all(&dir)
        .and_then(|()| std::fs::write(dir.join("simio.m"), SOURCE))
        .map_err(|e| failed(format!("cannot write {}: {e}", dir.display())))?;
    let out = Command::new("xcrun")
        .args(["clang", "-O2", "-fobjc-arc", "-framework", "Foundation"])
        .args(["-framework", "CoreGraphics", "-framework", "IOSurface"])
        .args(["simio.m", "-o", "simio.part"])
        .current_dir(&dir)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| failed(format!("cannot run xcrun clang: {e}")))?;
    if !out.status.success() {
        return Err(failed(format!(
            "xcrun clang could not build simio: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    std::fs::rename(dir.join("simio.part"), &exe)
        .map_err(|e| failed(format!("cannot keep {}: {e}", exe.display())))?;
    for entry in std::fs::read_dir(&root).into_iter().flatten().flatten() {
        if entry.file_name() != hash.as_str() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
    Ok(exe)
}

async fn developer_dir() -> Result<String> {
    let out = Command::new("xcode-select")
        .arg("-p")
        .output()
        .await
        .map_err(|e| failed(format!("cannot run xcode-select: {e}")))?;
    let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if dir.is_empty() {
        return Err(failed("xcode-select names no developer directory".into()));
    }
    Ok(dir)
}

/// Builds the helper if needed and starts it on the Simulator `udid`, once it says it holds the device.
async fn spawn(
    home: &Path,
    udid: &str,
    mode: &[&str],
) -> Result<(Child, ChildStdin, Lines<BufReader<ChildStdout>>)> {
    let exe = build(home).await?;
    let mut child = Command::new(exe)
        .arg(udid)
        .arg(developer_dir().await?)
        .args(mode)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| failed(format!("cannot start simio: {e}")))?;
    let stdin = child.stdin.take().expect("piped stdin");
    let mut stdout = BufReader::new(child.stdout.take().expect("piped stdout")).lines();
    reply(&mut stdout).await?;
    Ok((child, stdin, stdout))
}

async fn reply(stdout: &mut Lines<BufReader<ChildStdout>>) -> Result<Value> {
    let line = stdout
        .next_line()
        .await
        .map_err(|e| failed(format!("simio: {e}")))?
        .ok_or_else(|| failed("simio stopped".into()))?;
    let reply: Value =
        serde_json::from_str(&line).map_err(|e| failed(format!("simio answered {line:?}: {e}")))?;
    if reply["ok"] == true {
        Ok(reply)
    } else {
        Err(failed(format!(
            "simio: {}",
            reply["error"].as_str().unwrap_or("failed")
        )))
    }
}

/// The Simulator's screen as luma pictures, one each time its screen buffer is written.
pub struct Frames {
    _child: Child,
    stdout: Lines<BufReader<ChildStdout>>,
}

/// One picture: `width` by `height` luma samples, row by row.
pub struct Luma {
    pub width: u32,
    pub height: u32,
    pub y: Vec<u8>,
}

pub enum Seen {
    Picture(Luma),
    /// SpringBoard's lock state, first and on each change.
    Locked(bool),
}

impl Frames {
    /// Starts following the screen of `udid`, scaled to `pixels_per_point`.
    pub async fn start(home: &Path, udid: &str, pixels_per_point: f32) -> Result<Frames> {
        let (child, _, stdout) =
            spawn(home, udid, &["frames", &pixels_per_point.to_string()]).await?;
        Ok(Frames {
            _child: child,
            stdout,
        })
    }

    /// The next picture or lock state, or `None` once the helper has stopped (the Simulator shut down).
    pub async fn next(&mut self) -> Option<Seen> {
        loop {
            let line = self.stdout.next_line().await.ok()??;
            if let Some(seen) = parse(&line) {
                return Some(seen);
            }
        }
    }
}

fn parse(line: &str) -> Option<Seen> {
    use base64::Engine;
    let v: Value = serde_json::from_str(line).ok()?;
    if let Some(locked) = v["locked"].as_bool() {
        return Some(Seen::Locked(locked));
    }
    let (width, height) = (v["w"].as_u64()? as u32, v["h"].as_u64()? as u32);
    let y = base64::engine::general_purpose::STANDARD
        .decode(v["y"].as_str()?)
        .ok()?;
    (y.len() == (width * height) as usize).then_some(Seen::Picture(Luma { width, height, y }))
}

impl SimIo {
    /// Starts the touch helper on the Simulator `udid`.
    pub async fn start(home: &Path, udid: &str) -> Result<SimIo> {
        let (child, stdin, stdout) = spawn(home, udid, &["touch"]).await?;
        Ok(SimIo {
            _child: child,
            stdin,
            stdout,
        })
    }

    /// Plays one finger's path, in portrait points: down at the first point, through the others at their times, up
    /// at the last.
    pub async fn touch(&mut self, path: &[TimedPoint]) -> Result<()> {
        let mut line = request(path).to_string();
        line.push('\n');
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| failed(format!("simio: {e}")))?;
        reply(&mut self.stdout).await.map(|_| ())
    }
}

fn request(path: &[TimedPoint]) -> Value {
    let points: Vec<Value> = path
        .iter()
        .map(|p| json!({"x": p.at.x, "y": p.at.y, "t_ms": p.t_ms}))
        .collect();
    json!({"op": "touch", "path": points})
}

#[cfg(test)]
mod tests {
    use super::*;
    use phonedriver_core::geometry::Point;

    #[test]
    fn a_picture_and_a_lock_state_are_read_and_a_picture_whose_size_does_not_match_is_dropped() {
        let Some(Seen::Picture(luma)) = parse(r#"{"w":2,"h":2,"y":"AAECAw=="}"#) else {
            panic!("no picture");
        };
        assert_eq!((luma.width, luma.height, luma.y), (2, 2, vec![0, 1, 2, 3]));
        assert!(parse(r#"{"w":3,"h":2,"y":"AAECAw=="}"#).is_none());
        assert!(matches!(
            parse(r#"{"locked":true}"#),
            Some(Seen::Locked(true))
        ));
    }

    #[test]
    fn a_path_is_sent_with_every_point_and_its_time() {
        let at = |x, y, t_ms| TimedPoint {
            at: Point { x, y },
            t_ms,
        };
        assert_eq!(
            request(&[at(10.0, 20.5, 0), at(10.0, 20.5, 0)]),
            json!({"op": "touch", "path": [{"x": 10.0, "y": 20.5, "t_ms": 0}, {"x": 10.0, "y": 20.5, "t_ms": 0}]})
        );
    }
}
