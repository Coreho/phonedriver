//! The pipeline from an agent video stream to the frame store.

use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::AsyncRead;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

use crate::frame_store::FrameStore;
use crate::h264::{self, AccessUnit, CodecHeader, Decoder, WirePacket};
use crate::record::{Recorded, Recording};

/// Packets waiting for the decoder. When it is full the socket reader waits, which pushes back on the
/// agent instead of dropping inter-predicted frames the decoder needs.
const QUEUE: usize = 8;

/// What a sample added to a recording lasts until the next one says otherwise.
const FRAME_US: u64 = 16_667;
/// What the units a recording starts with last: they only bring the decoder to the picture at the start.
const CATCH_UP_US: u64 = 12;

enum Item {
    Unit(Arc<AccessUnit>),
    Barrier(u64),
}

/// A recording that has ended. `early` says why it ended before `record_stop`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stopped {
    pub recorded: Recorded,
    pub early: Option<&'static str>,
}

struct Live {
    rec: Recording,
    began: Instant,
    /// The newest picture's time stamp, and where it sits in the video, in microseconds.
    newest: Option<(u64, u64)>,
}

impl Live {
    fn clock(&self) -> u64 {
        self.began.elapsed().as_micros() as u64
    }

    /// Where a picture stamped `pts_us` and read now sits in the video: after the one before it by the gap between
    /// their stamps, and never later than now. Observed on the API 37 emulator's software encoder: the stamps ran
    /// 0.6 s ahead of the clock over 5 s (frames repeated for an idle screen are stamped 100 ms apart), so a video
    /// timed by stamps alone outlasted its recording and ran ahead of the steps file.
    fn place(&mut self, pts_us: u64) -> u64 {
        let now = self.clock();
        let at = match self.newest {
            Some((pts, at)) => (at + pts_us.saturating_sub(pts)).min(now).max(at),
            None => now,
        };
        let before = self.newest.map_or(0, |(_, at)| at);
        self.rec.stretch_last(at - before);
        self.newest = Some((pts_us, at));
        at
    }
}

/// What the reader keeps of the stream so a recording can start at any moment: the parameter sets and every unit
/// since the last keyframe (the agent sends one every 10 s), which together decode to the picture now on screen.
#[derive(Default)]
struct Tap {
    header: Option<CodecHeader>,
    config: Option<Arc<AccessUnit>>,
    group: Vec<Arc<AccessUnit>>,
    live: Option<Live>,
    ended: Option<io::Result<Stopped>>,
}

impl Tap {
    fn unit(&mut self, unit: &Arc<AccessUnit>) {
        if unit.config {
            self.config = Some(unit.clone());
            self.group.clear();
        } else {
            if unit.keyframe {
                self.group.clear();
            }
            self.group.push(unit.clone());
        }
        let Some(live) = &mut self.live else { return };
        if !unit.config {
            live.place(unit.pts_us);
        }
        if let Err(e) = live.rec.push(unit, FRAME_US) {
            self.live = None;
            self.ended = Some(Err(e));
        }
    }

    fn end(&mut self, why: Option<&'static str>) {
        if let Some(mut live) = self.live.take() {
            let shown = live.newest.map_or(0, |(_, at)| at);
            live.rec.stretch_last(live.clock().saturating_sub(shown));
            self.ended = Some(live.rec.finish().map(|recorded| Stopped {
                recorded,
                early: why,
            }));
        }
    }
}

pub struct VideoStream {
    pub store: Arc<FrameStore>,
    reader: JoinHandle<()>,
    done: watch::Receiver<bool>,
    passed: watch::Receiver<u64>,
    barriers: AtomicU64,
    tap: Arc<Mutex<Tap>>,
}

impl VideoStream {
    /// Reads the agent's video wire format from `reader` and decodes it into a new `FrameStore`.
    pub fn spawn<R: AsyncRead + Unpin + Send + 'static>(
        mut reader: R,
        store: FrameStore,
    ) -> VideoStream {
        let store = Arc::new(store);
        let (tx, mut rx) = mpsc::channel::<Item>(QUEUE);
        let (done_tx, done) = watch::channel(false);
        let (passed_tx, passed) = watch::channel(0u64);

        let decoder_store = store.clone();
        std::thread::spawn(move || {
            if let Ok(mut decoder) = Decoder::new() {
                while let Some(item) = rx.blocking_recv() {
                    match item {
                        Item::Unit(unit) => match decoder.decode(&unit.data) {
                            Ok(Some(frame)) => {
                                decoder_store.publish(frame);
                            }
                            Ok(None) => {}
                            Err(_) => decoder_store.record_decode_error(),
                        },
                        Item::Barrier(id) => {
                            passed_tx.send_replace(id);
                        }
                    }
                }
            }
            done_tx.send_replace(true);
        });

        let tap = Arc::new(Mutex::new(Tap::default()));
        let reader_tap = tap.clone();
        let reader = tokio::spawn(async move {
            let lock = || reader_tap.lock().unwrap_or_else(|e| e.into_inner());
            let Ok(header) = h264::read_header(&mut reader).await else {
                return;
            };
            lock().header = Some(header);
            while let Ok(packet) = h264::read_packet(&mut reader).await {
                let item = match packet {
                    WirePacket::Access(unit) => {
                        let unit = Arc::new(unit);
                        lock().unit(&unit);
                        Item::Unit(unit)
                    }
                    WirePacket::Barrier(id) => Item::Barrier(id),
                    WirePacket::Reconfigure(header) => {
                        let mut tap = lock();
                        tap.end(Some("the screen changed size or turned"));
                        tap.header = Some(header);
                        tap.config = None;
                        tap.group.clear();
                        continue;
                    }
                };
                if tx.send(item).await.is_err() {
                    break;
                }
            }
            lock().end(Some("the device's video stream ended"));
        });

        VideoStream {
            store,
            reader,
            done,
            passed,
            barriers: AtomicU64::new(0),
            tap,
        }
    }

    fn tap(&self) -> std::sync::MutexGuard<'_, Tap> {
        self.tap.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Starts writing the stream to an MP4 file at `path`. The file opens with the picture now on screen.
    pub fn record_start(&self, path: &Path) -> io::Result<()> {
        let mut tap = self.tap();
        if tap.live.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "a recording is already running",
            ));
        }
        let header = tap.header.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotConnected,
                "the video stream has not started",
            )
        })?;
        let mut rec = Recording::create(path, header.width, header.height)?;
        if let Some(config) = &tap.config {
            rec.push(config, CATCH_UP_US)?;
        }
        for unit in &tap.group {
            rec.push(unit, CATCH_UP_US)?;
        }
        tap.ended = None;
        tap.live = Some(Live {
            rec,
            began: Instant::now(),
            newest: None,
        });
        Ok(())
    }

    /// Ends the recording and finishes its file. `None` when none was running. A recording that already ended
    /// (the screen turned, the stream stopped) is returned once, with why.
    pub fn record_stop(&self) -> io::Result<Option<Stopped>> {
        let mut tap = self.tap();
        tap.end(None);
        tap.ended.take().transpose()
    }

    pub fn recording(&self) -> bool {
        self.tap().live.is_some()
    }

    /// A number to put in a `video_barrier` request to the agent.
    pub fn next_barrier(&self) -> u64 {
        self.barriers.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// True once barrier `id` has come back through the stream, which means every packet the agent wrote before it has
    /// been decoded and shown. False when the stream ended or `limit` passed without it: a stream that still looks
    /// open but delivers nothing (a dead agent no socket has reported yet) is never caught up.
    pub async fn wait_barrier(&self, id: u64, limit: Duration) -> bool {
        let mut passed = self.passed.clone();
        tokio::time::timeout(limit, passed.wait_for(|p| *p >= id))
            .await
            .is_ok_and(|r| r.is_ok())
    }

    /// True once the stream has ended. A quiet stream is not an ended one: a static screen sends no frames.
    pub fn ended(&self) -> bool {
        *self.done.borrow()
    }

    /// Resolves once the stream has ended and every packet read has been decoded.
    pub async fn finished(&self) {
        let mut done = self.done.clone();
        let _ = done.wait_for(|d| *d).await;
    }
}

impl Drop for VideoStream {
    fn drop(&mut self) {
        self.reader.abort();
    }
}
