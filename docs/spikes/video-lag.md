# Spike: why a screenshot showed the screen from before the tap

2026-11-16. API 37 emulator (`Pixel_API_37` on win-pc, started in the desktop session with `-gpu host`), daemon on the Mac mini (debug build) through the adb tunnel. Every run started with the guest's `/proc/pressure/io` `avg10` under 4. Throwaway code: log lines in the agent's video writer (logcat tag `PDLAG`: for every frame, `System.nanoTime` minus its presentation time when it was written; for every barrier, when it was asked for and when it was written) and one line in the host's `caught_up`. The code is deleted; this is its record.

## Question

D73 shipped with an open defect: with two lanes and the phone's own screen streaming, a screenshot taken right after a tap on a lane showed the list from before the tap, although the tap's reply already said `new screen`. Where is the picture held up?

## What ran

Lane `b` shows Settings and taps into Network & internet and back; lane `a` taps the testbed's buttons at the same moment; a screenshot of lane `b` is taken right after each tap's reply, and again two seconds later. A screenshot of the Settings list is 105 to 124 KB and one of the Network page 63 to 76 KB, so the size says which one it is.

### How long a frame stays in the encoder

One lane alone, the time from the screen showing a frame to the encoder (`c2.android.avc.encoder`, software, as on every emulator) giving it out:

| Hidden display | Median | p90 | Max |
|---|---|---|---|
| 1080x2424, 30 frames a second (as shipped in D73) | 598 ms | 899 ms | 997 ms |
| 1080x2424, 15 frames a second | 390 ms | 909 ms | 1070 ms |
| 822x1846 (two pixels a point), 30 frames a second | 369 ms | 585 ms | 742 ms |
| 822x1846, 15 frames a second | 43 ms | 118 ms | 191 ms |

Two lanes and the phone's own screen (a running Clock) at once: median 2.6 to 3.1 s, max 4.8 s at the shipped size, and still 2.4 to 5 s in every variant. `media.swcodec` used 190 to 336% of a processor.

Two lanes at 822x1846 and 15 frames a second, frame by frame: a still lane's frames came out 30 to 50 ms after their time. After the two taps the encoder gave nothing for up to 611 ms at a time, the frames queued, and they came out up to 1.45 s late (1.94 s in another run); the queue then emptied at about 30 frames a second. After the last change the encoder repeats the last frame every 100 ms, nine or ten times, then gives nothing.

### What the host waited for

| Screenshot | Barrier number the host waited for | Number the agent wrote | Agent held it | Host waited |
|---|---|---|---|---|
| 1 | 1 | 18 | 712 ms | 729 ms |
| 2 | 2 | 19 | 4 ms | 16 ms |
| 3 | 3 | 32 | 459 ms | 34 ms |
| 5 | 5 | 45 | 664 ms | 7 ms |

## Findings

1. **The screenshot barrier (06bab61, 2026-11-08) never worked after a connection's first screenshot.** The host sent the barrier's number as `id`. `Control::request` stamps every request with its own `id`, so the agent got, and wrote back, the request's id, which is always the larger number. The host waits for a barrier `>=` its own number, so from the second screenshot on the wait was over before it began. A screenshot was the newest frame the host had decoded when the control reply came, nothing more. Releases 0.1.2 to 0.1.4 have this.
2. **A working barrier is still not enough.** The agent wrote it after the encoder output on hand. Frames the encoder had taken and not given out came after it: up to 1.45 s of them here.
3. **A software encoder does not keep up with a phone panel at 30 frames a second**, even for one stream. At two pixels a point and 15 frames a second it does for one stream, and falls behind for a second or two when two streams animate at once.

## What was built (D74)

- The barrier's number travels as `barrier`; a debug assertion refuses a request that brings its own `id`.
- The agent holds a barrier while its encoder is behind (its last frame came out more than 100 ms late) until a frame shown after the request is out, or until the encoder has given nothing for longer than it was behind. It answers the request with how far behind it is (`wait_ms`), and the host waits that much longer before it calls the device gone.
- A hidden display on a software encoder is opened at two pixels a point and 15 frames a second.

A first version of the hold used one estimate of the encode time for the whole process (a decaying maximum) and let a barrier go after twice that with no output. It let go during a 216 ms stall with the estimate at 77 ms, and the next frame was 943 ms late; dropped.

## After

Screenshot of lane `b` right after each tap, five rounds each:

| Run | Showed the page | Time for the screenshot |
|---|---|---|
| Two lanes, before | 1 of 5, 1 of 5, 0 of 5 (three runs) | 0.21 to 0.40 s |
| Two lanes and the phone's screen, before | 1 of 10 | - |
| Two lanes, after | 5 of 5 (3 byte-identical to the shot two seconds later) | 0.61 to 1.11 s |
| Two lanes and the phone's screen showing Clock, after | 5 of 5 (2 byte-identical) | 1.41 to 1.73 s |
| The phone's own screen alone, after | 5 of 5 (3 byte-identical) | 0.48 to 0.74 s after a tap, 0.15 to 0.21 s on a still screen |

Every tap landed in every run (the testbed's log has `b1` to `b5` each time). A screenshot of the phone's own screen with Clock running under three streams took 3.49 s.

## Not done

- The phone's own screen keeps its full size and 30 frames a second on a software encoder, because recordings come from that stream; so on an emulator a screenshot right after an action waits about half a second for the encoder.
- The presentation time was compared with `System.nanoTime` on this one emulator. No physical phone, no hardware encoder, no other API level.
- An encoder that was on time at its last frame and then stalls with the tap's frames inside it is not waited for. Not seen in the fifteen screenshots after the change.
