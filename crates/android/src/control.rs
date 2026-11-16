//! The control stream: requests with ids, replies matched by id, pushed events.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use phonedriver_core::device::DeviceEvent;
use phonedriver_core::error::{DeviceId, Error, Op};
use serde_json::Value;
use tokio::net::TcpStream;
use tokio::net::tcp::OwnedWriteHalf;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::adb::Result;
use crate::agent::{read_frame, write_frame};
use crate::map;

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>;

/// Observed through an ssh tunnel to the adb server that stalled without closing: a tap waited 631 s for its reply,
/// until the kernel gave up on the connection, and every other call on the device queued behind it.
const NO_REPLY_MARGIN: Duration = Duration::from_secs(30);

pub struct Control {
    device: DeviceId,
    writer: tokio::sync::Mutex<OwnedWriteHalf>,
    pending: Pending,
    next_id: AtomicU64,
    reader: JoinHandle<()>,
}

impl Control {
    /// Takes over a control stream that has already said hello. Pushed events go to `events`; when the
    /// stream ends, `DeviceEvent::Gone` is sent and every waiting request fails with `DeviceGone`.
    pub fn new(
        device: DeviceId,
        stream: TcpStream,
        density: f32,
        events: broadcast::Sender<DeviceEvent>,
    ) -> Control {
        let (mut read, write) = stream.into_split();
        let pending: Pending = Arc::default();
        let waiting = pending.clone();
        let reader = tokio::spawn(async move {
            while let Ok(frame) = read_frame(&mut read).await {
                if let Some(id) = frame["id"].as_u64() {
                    let sender = waiting
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .remove(&id);
                    if let Some(tx) = sender {
                        let _ = tx.send(frame);
                    }
                } else if let Some(event) = map::event(&frame, density) {
                    let _ = events.send(event);
                }
            }
            waiting.lock().unwrap_or_else(|e| e.into_inner()).clear();
            let _ = events.send(DeviceEvent::Gone);
        });
        Control {
            device,
            writer: tokio::sync::Mutex::new(write),
            pending,
            next_id: AtomicU64::new(1),
            reader,
        }
    }

    /// Sends `req` (an object with an `op`) and returns the agent's reply. `op` names the operation in errors.
    /// `runs_for` is how long the request itself may take on the device (a shell command's limit, a gesture's
    /// length); a reply that has not come `NO_REPLY_MARGIN` after that means the link is gone.
    pub async fn request(&self, op: Op, mut req: Value, runs_for: Duration) -> Result<Value> {
        let gone = || Error::DeviceGone {
            id: self.device.clone(),
        };
        debug_assert!(req.get("id").is_none(), "`id` is the channel's: {req}");
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        req["id"] = id.into();
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, tx);
        if write_frame(&mut *self.writer.lock().await, &req)
            .await
            .is_err()
        {
            self.pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
            return Err(gone());
        }
        let Ok(reply) = tokio::time::timeout(runs_for + NO_REPLY_MARGIN, rx).await else {
            self.pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
            return Err(gone());
        };
        let reply = reply.map_err(|_| gone())?;
        if reply["ok"] == true {
            Ok(reply)
        } else {
            Err(map::reply_error(
                op,
                reply["error"].as_str().unwrap_or("no error text"),
            ))
        }
    }
}

impl Drop for Control {
    fn drop(&mut self) {
        self.reader.abort();
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tokio::net::TcpListener;

    use super::*;

    async fn connected() -> (Control, TcpStream) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let host = TcpStream::connect(listener.local_addr().unwrap())
            .await
            .unwrap();
        let (agent, _) = listener.accept().await.unwrap();
        let (events, _) = broadcast::channel(4);
        (Control::new("android:x".into(), host, 2.0, events), agent)
    }

    #[tokio::test(start_paused = true)]
    async fn a_request_the_agent_never_answers_ends_as_a_gone_device_after_its_own_time_and_the_margin()
     {
        let (control, _agent) = connected().await;
        let started = tokio::time::Instant::now();
        let e = control
            .request(Op::Shell, json!({"op": "shell"}), Duration::from_secs(60))
            .await
            .unwrap_err();
        assert_eq!(
            e,
            Error::DeviceGone {
                id: "android:x".into()
            }
        );
        assert_eq!(started.elapsed(), Duration::from_secs(90));
    }

    #[tokio::test]
    async fn a_barrier_request_carries_its_number_apart_from_the_requests_own_id() {
        let (control, mut agent) = connected().await;
        let answer = tokio::spawn(async move {
            let asked = read_frame(&mut agent).await.unwrap();
            write_frame(&mut agent, &json!({"id": asked["id"], "ok": true}))
                .await
                .unwrap();
            (asked, agent)
        });
        control
            .request(
                Op::Screenshot,
                crate::device::barrier_request(700),
                Duration::ZERO,
            )
            .await
            .unwrap();
        let (asked, _agent) = answer.await.unwrap();
        assert_eq!(asked["barrier"], 700);
    }

    #[tokio::test]
    async fn a_reply_with_the_request_id_is_the_answer() {
        let (control, mut agent) = connected().await;
        let answer = tokio::spawn(async move {
            let asked = read_frame(&mut agent).await.unwrap();
            write_frame(&mut agent, &json!({"id": asked["id"], "ok": true, "n": 7}))
                .await
                .unwrap();
            agent
        });
        let reply = control
            .request(Op::Tree, json!({"op": "tree"}), Duration::ZERO)
            .await
            .unwrap();
        assert_eq!(reply["n"], 7);
        drop(answer.await.unwrap());
    }
}
