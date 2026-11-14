---
title: "How phonedriver works: reading a phone's screen without uiautomator dump"
short: How phonedriver reads a phone without uiautomator dump
meta: How phonedriver lets an AI agent operate Android and iOS phones: the resident agent, settle detection, the text format, the benchmarks and what it loses.
description: How phonedriver reads and drives a phone, with the 12.7 ms against 2,163.7 ms comparison scoped, the prior work it builds on, the token result with every run, and what does not work.
date: 2026-11-14
label: ENGINEERING
short_card: How phonedriver works, without uiautomator dump
card_sub: The mechanism, the method, the prior art, the losses and the data.
seo: How phonedriver works: reading a phone without uiautomator dump
---

On one Android 17 emulator, phonedriver reads a 1,000-row list in 12.7 ms at p50 over 50 runs. `uiautomator dump`, a one-off command that starts a process, connects to the accessibility service and waits for one second of quiet, needs 2,163.7 ms for the same list.

The ratio is 170, with a 95% confidence interval of 162.0 to 177.4. It is the largest of the rows I measured, and its fairer rival is a server that stays resident, such as the UiAutomator2 server in Appium. I did not measure that. The Settings screen in the same run reads in 51.0 ms. On a HONOR X8 phone the read takes 78.5 ms against 2,506.6 ms.

phonedriver is an open-source MCP server and CLI that lets Claude Code, Codex, Cursor or another MCP client operate an Android phone or an iPhone. I'm its only developer. Most of its ideas are other people's, and I name them where they appear. Every number comes from a file in the repository, and the last section lists the commands.

I built it because almost nothing on my phone has an API. An AI agent could tell me what to tap, and never tap it.

## What the agent sees

Three terms. "The agent" is the AI that calls phonedriver. "The device agent" is the Java process phonedriver runs on an Android phone. "The daemon" is the long-lived phonedriver process on your computer, which the CLI and MCP server call.

The agent asks for a screen and gets a numbered list. This is Settings on an Android emulator, copied from the README:

```screen
$ phonedriver snapshot
app com.android.settings (Settings) · keyboard hidden · settled in 0ms
@e1 button "Search Settings"
@e2 group scrollable↓
  @e3 button "Google" "Services & preferences"
  @e4 button "Network & internet" "Mobile, Wi‑Fi, hotspot"
  @e5 button "Connected devices" "Bluetooth, pairing"
  ...
  @e10 button "Display & touch" "Dark theme, font size, touch"
```

`@e10` is a ref. The agent taps by ref, and the reply to `tap @e10` is the Display screen in full, including `@e24 switch "Dark theme" off`. The next tap returns only what changed:

```screen
$ phonedriver tap @e24
ok tapped @e24 "Dark theme" at 353,532 · settled in 2034ms
~ @e23 button "Dark theme" "Will turn on when Bedtime starts" → "Will never turn off automatically"
~ @e24 switch "Dark theme" off → on
```

`+` marks a line that appeared, `-` a line that left, `~` a line that changed. The reply comes after the screen stops changing, so the agent never polls or sleeps. If more than 60% of the refs changed, the reply is a full snapshot, because the agent is on a new screen.

Refs are not my idea. Playwright MCP returns accessibility snapshots with refs such as `[ref=e5]` ([docs](https://playwright.dev/mcp/snapshots)). Vercel's [agent-browser](https://github.com/vercel-labs/agent-browser) prints `@e1` for each element and runs as a CLI over a background daemon, which is also phonedriver's shape.

## Where the 2.2 seconds goes

Every `uiautomator dump` is a new process. The AOSP launcher script ends in `exec app_process ${base}/bin com.android.commands.uiautomator.Launcher ${args}` ([uiautomator.sh](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/cmds/uiautomator/cmds/uiautomator/uiautomator.sh)). `DumpCommand` then creates a `UiAutomationShellWrapper`, connects, calls `uiAutomation.waitForIdle(1000, 1000 * 10)`, reads `getRootInActiveWindow()` and writes the tree as XML to a file ([DumpCommand.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/cmds/uiautomator/cmds/uiautomator/src/com/android/commands/uiautomator/DumpCommand.java)). A timeout prints `ERROR: could not get idle state.`

The [UiAutomation reference](https://developer.android.com/reference/android/app/UiAutomation) defines `waitForIdle` as waiting for the accessibility event stream to go quiet: no event within `idleTimeoutMillis`. With these arguments a dump needs one second without accessibility events and gives up at ten.

So each call pays a process start, a UiAutomation connect and an idle wait, which puts a floor near one second on a quiet screen. I did not time the three parts. The split of the 2.2 s is inferred from the source and was not timed.

Three observations bear on the split, and none settles it. adb's p50 is 2,163.7 ms on the list and 2,215.7 ms on Settings, while phonedriver's moves from 12.7 to 51.0 ms. With a spinner on screen, `uiautomator dump` took about 2.6 s on API 37 and 2.0 s on API 26 (three runs each) and did not fail. On the HONOR X8's main Settings page it failed after 11.5 s with the timeout error, and phonedriver read the page in 110 ms.

The run is from 11 November 2026: phonedriver 0.1.1 from main `c3c3598`, on an Android 17 emulator with software rendering, hosted on a Windows 11 machine with an Intel Core i9-13900K. The tools ran interleaved, and host CPU load was 31% to 80%. Each row is 50 samples after 20 warm-ups, except cold start (10).

| Operation | phonedriver p50 / p95 ms | adb p50 / p95 ms | adb ÷ phonedriver at p50 (95% CI) |
|---|---|---|---|
| Read a 1,000-row list | 12.7 / 20.0 | 2,163.7 / 2,204.5 | 170.0x (162.0 to 177.4) |
| Read the Settings screen | 51.0 / 146.3 | 2,215.7 / 3,054.8 | 43.5x (41.1 to 48.0) |
| Screenshot | 9.1 / 11.1 | 291.2 / 763.7 | 32.0x (30.9 to 33.2) |
| Type 100 characters | 158.3 / 426.6 | 3,638.4 / 9,234.2 | 23.0x (19.7 to 25.1) |
| Tap, then what changed | 514.0 / 612.0 | 2,477.2 / 5,460.4 | 4.8x (4.7 to 5.2) |
| Tap, 1.5 s apart | 28.7 / 42.2 | 69.4 / 89.5 | 2.4x (2.3 to 2.6) |
| Tap, back to back | 38.5 / 175.6 | 170.5 / 205.1 | 4.4x (3.0 to 5.2) |
| Cold start to first screen read | 1,176.0 / 3,014.6 | 2,248.4 / 7,443.5 | 1.9x (1.4 to 2.4) |

- The 12.7 ms is a JSON-RPC request, sent from the benchmark's Python process to a daemon that is already running with the device agent connected. It excludes the 1,176.0 ms to start the device agent and read the first screen. Each adb call starts an `adb` process, as an agent using adb would. adb has no cold start, so its figure is the Settings dump.
- adb returns raw XML and its tap returns before the app reacts. phonedriver returns a pruned numbered tree and waits for the app. The adb "tap, then what changed" row is a tap, a dump and a diff in the caller.
- phone-harness, a Python library that wraps adb, took 2,362.5 ms on the list (185.6x), run in process.
- The first 11 November pass gave 193.1x for the list. I report the lower second pass.

On 9 November I ran two operations on a HONOR X8 (Android 13, USB). phonedriver ran through the CLI, a new process per call, with 30 samples per row. adb had 20 samples, and the two never ran at once.

| Operation | phonedriver p50 / p95 ms | adb p50 / p95 ms | Ratio |
|---|---|---|---|
| Read the screen (`snapshot --no-settle`) | 78.5 / 128.5 | 2,506.6 / 2,583.9 | 32x |
| Screenshot | 16.4 / 21.4 | 1,005.7 / 1,097.6 | 61x |

The phone read was 461 bytes against 25,334 bytes of XML. phonedriver takes about three times as long there as on the emulator host, and adb's dump takes about the same.

### A faster read and the length of a step

The usual objection is that the model call dominates each step. The repository has no split of a step into model time and tool time, so I can't give you the share.

It has wall time and call counts. In the 10 November job runs (below), phonedriver's sum of per-job median wall times is 306 s over 99 tool calls, about 3.1 s per call. mobile-mcp's is 523 s over 276.5 calls, about 1.9 s per call. These sums of medians are rough. They say phonedriver's calls are not shorter than mobile-mcp's, and its wall-time lead comes from making fewer calls. An earlier evaluation put a whole task at about 18 s and 6 tool calls, and my speed audit concluded that tool time is a minority of a task. A faster read matters most against a tool that pays 2.2 s per look, and I can't say how much of a step that is.

## A process that stays

The fix for per-call cost is to start one process and keep it. The technique is old.

[scrcpy](https://github.com/Genymobile/scrcpy) runs a Java server on the phone as the shell user. Romain Vimont's [2018 introduction](https://blog.rom1v.com/2018/03/introducing-scrcpy/) says: "It is possible to execute Java code as shell on Android, by invoking app_process from adb shell." AOSP's `uiautomator` command does the same, and [Shizuku](https://github.com/RikkaApps/Shizuku) starts a Java server with `app_process` that hands a Binder to apps.

phonedriver's device agent is that technique with scrcpy's files in it. The README and NOTICE credit scrcpy under Apache-2.0, the encoder settings follow its `SurfaceEncoder`, and the jar is built with `javac` and `d8` as its `build_without_gradle.sh` does.

On connect, the daemon pushes `/data/local/tmp/phonedriver-agent-<sha8>.jar` if that path is missing (`<sha8>` is the first eight hex digits of the jar's SHA-256). It starts `CLASSPATH=<jar> app_process / dev.phonedriver.agent.Main <version> <socket-name>` over an adb `shell,v2,raw:` stream and writes a 32-byte random token to its stdin. The device agent listens on an abstract socket, and the daemon opens two streams to it through adb's `localabstract:` service: `control`, carrying length-prefixed JSON, and `video`.

Abstract sockets have no permissions, so any app on the phone can connect. The first request on each stream must carry the token, or the device agent drops the connection. Otherwise any installed app would get shell-uid input injection and a screen reader.

The daemon holds the shell stream open, and adbd kills the child when it closes, so a crashed daemon can't leave a device agent running. That takes about 1.0 s (1,054 and 1,137 ms).

```text
 MCP client or CLI            your computer                              phone
 -----------------   +------------------------------+        +----------------------------------+
 phonedriver mcp  -->|                              |        | phonedriver-agent                |
 phonedriver tap  -->| phonedriver daemon           | adb    |   app_process, shell uid         |
   JSON-RPC over     |   ref table, diff,           | server |   control stream: JSON           |
   a local socket    |   settle detector,           |------->|   video stream: H.264            |
                     |   H.264 decoder              | :5037  |   UiAutomation                   |
                     +------------------------------+        |   InputManager, MediaCodec       |
                                                             +----------------------------------+
```

The daemon speaks the adb server protocol itself, on TCP, instead of starting an `adb` process per call. In the spike, `shell,v2,raw:echo hi` took 52 to 64 ms at p50 through an ssh tunnel with a 38 to 40 ms floor, against 247 to 248 ms for the `adb` command.

I rejected two other designs. An installed AccessibilityService app must, per its [reference](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService), be turned on by the user in device settings, and it stays installed on the phone. An instrumentation APK is how Appium's [UiAutomator2 server](https://github.com/appium/appium-uiautomator2-server) runs: a netty server on the device, started with `am instrument`. I rejected it for the install and signing step, and I assumed it pays instrumentation overhead, which I have not measured. If you run Appium suites or need its device clouds, it is the better choice. It is also resident, so it is the right baseline here, and I did not run it.

## UiAutomation from a shell process

The device agent reads the screen through UiAutomation, which the reference calls "a special type of AccessibilityService which does not provide hooks for the service life cycle and exposes other APIs that are useful for UI test automation". It can also inject input, so one connection covers reading and acting. A shell process has no `Context`, so the connection is built by hand: `new UiAutomation(Looper, IUiAutomationConnection)` is public on API 26 and 37, and the hidden `connect(int flags)` is called by reflection (12 to 43 ms).

Four details came out of the spike on API 26 and 37 emulators:

- **The flag.** By default UiAutomation suppresses other accessibility services. With `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES` (API 24) it doesn't. On API 37, flags of 0 unbound TalkBack while the device agent held the connection, and the flag kept it bound.
- **The cache.** The device agent subscribes only to window events, so without `clearCache()` before each read, a read after a tap returned a counter's old text.
- **The walk.** A tree costs about one binder round trip per 2 to 4 nodes in every prefetch mode. On Settings main (192 nodes in two windows, API 37), a depth-first `getChild` with prefetch took 75 ms at p50 and 52 round trips, against 130 ms and 69 for the default walk.
- **One client.** Only one UiAutomation client can be registered. While the device agent holds it, `uiautomator dump` is killed with exit 137 and prints nothing, and logcat shows `UiAutomationService ... already registered!`. That is why the speed benchmark runs the tree-reading tools in turns, and why phonedriver can't share a phone with another tool that wants the bridge.

## Knowing the screen has settled

After a tap, the agent needs the screen as it ends up. A fixed sleep is slow or wrong. Accessibility events are the obvious input, and I left them out: apps emit content-change events for invisible changes and tickers, and a clock label that updates every 100 ms would never settle.

Pixels are the ground truth for "the screen moved". So the device agent mirrors the display into a MediaCodec H.264 encoder and streams it to the daemon, which decodes it with OpenH264. A screenshot is the latest decoded frame, which is why one takes 9.1 ms against 291.2 ms for `screencap`. Every frame is also a change signal. The stream costs an encoder on the phone and a decoder on the host that uses at most about one core at 1080p30. The first decoded frame takes 219 ms (API 26) or 433 ms (API 37) at p50, paid once per lease.

The detector compares each frame's luma thumbnail, one sample per 4 by 4 points, with the last, and counts the changed samples times 16 as the changed area. First it waits up to 500 ms (3 s for `launch` and `open`) for a window event or a frame that changes more than 128 pt². Then it waits for 250 ms with no window event and no frame above 4,096 pt². The first phase exists because a tap that starts a cold activity can show nothing for hundreds of milliseconds, and "settled, nothing changed" would make the agent tap again. At the timeout (5 s for actions) it returns what it has with `settled: false`, because looping video never settles.

The spike behind the two thresholds ran 20 times per case on API 26 and 37:

```text
largest single-frame change seen, pt²

 13,000 to 254,000   screen transition
  4,096              significant_area: a frame above this is not quiet
    480              48 dp indeterminate spinner
    432              Material switch toggle
    128              first_change_area: a frame above this is a first change
     96              blinking caret
```

My first design had one threshold, 4,096 pt², a 64 by 64 point region. It separated transitions from the caret, spinner and toggle, and it hid the toggle: zero of 20 toggle taps produced a frame above it, so a tap that worked would have been reported as `changed: false`. A failing test came first, then the second threshold.

I was also wrong about the frame rate. I expected a steady one on a static screen. On the API 37 emulator through an ssh tunnel the stream sent bursts of about 10 frames per second and then nothing for up to 5 s, so a rule of "no frame for 1 s means dead" made 18 of 40 screenshots of an idle screen fail. Screenshots now serve the last frame unless the video socket has ended.

The same burstiness is the detector's known limit. A gap over 250 ms in the middle of an animation reads as quiet, and the screen is reported settled early. I saw this on the emulators' software encoder. The design notes say hardware encoders were not measured for it, and the HONOR X8 pass did not test settle. On iOS 26 and below and on the Simulator there is no frame stream, and the detector is fed by polling gray screenshots instead.

## Making the text small

On the HONOR X8's Display & brightness page, `uiautomator dump` returned 25,334 bytes. phonedriver's text was 461.

The renderer drops invisible nodes, then labels actionable containers from their text. On Android the clickable node is usually an unlabeled layout whose text sits in `TextView` children, as in every Settings row, so the first descendant text becomes the label and the rest join into a hint. It then collapses containers that have no label, no actions and one child, and keeps a node only if it has actions or text, is a text field, or scrolls.

The keyboard prints as one node without its keys, because about sixty key nodes made the first typed character look like a new screen in the diff.

Refs need a rule of their own because Android recycles list rows. In the spike, a `ListView` of 1,000 rows scrolled four times kept each recycled row's node id while its text changed: `-4294967273: "Row 13"` became `"Row 29"`. If a ref followed the node id, `@e12` "Row 12" would silently become "Row 20" and the next tap would hit the wrong row. So a platform id matches only when the role is the same and either the label is unchanged or the bounds moved less than 8 points. At action time a ref resolves against a fresh tree, and a ref whose element is gone fails with an error naming the closest current match.

The tree can be wrong. A checkbox in a Chrome web view reports neither checkable nor checked, before or after a toggle, so a tap replied "no element changed" and agents took screenshots. The daemon now reads that checkbox's state from the screenshot's pixels, and a custom checkbox with a white or gray tick reads `off`.

## Tokens: what a turn costs

When phonedriver first spent more tokens than phone-harness on three tasks (413,534 against 337,059), I took the six runs apart turn by turn. Every turn re-reads the whole context, so total tokens are roughly turns times context, and the context is mostly fixed. Tool results across a run came to only 3,000 to 11,000 tokens. The fixed prefix was 59% to 81% of each phonedriver run.

I measured the prefix with one-word `claude -p` runs: 3,217 tokens with no tools, 5,139 with the `Bash` tool, 7,421 with phonedriver's 14 tools. Tools plus instructions cost 4,204 tokens on every turn, so phonedriver's prefix was 2,900 tokens longer than phone-harness's, and over 36 turns that exceeded the whole 76,000-token gap. I cut the `tools/list` text from 10,987 to 5,107 characters by dropping schema boilerplate, a repeated `device` property and arguments no agent had used. Tools plus instructions fell from 4,204 to 2,768 tokens. A later round recorded a first-turn context of 5,606 tokens against 5,214 for phone-harness.

The other change was what a reply holds. Of phonedriver's 36 turns, 15 were wasted by my definition: the previous reply lacked what the agent then went to fetch. A tap on "Add alarm" replied with removals only, because the pixel-based settle ended before the accessibility tree held the new dialog, and the agent took a screenshot to find out. Replies now read the tree again until two reads agree.

I also built `batch`, which runs a list of steps and settles between them, and a path form of `tap`. A sentence in the server instructions telling agents to batch produced one batch call in 18 runs, so I removed it, and I don't credit `batch` for the results below.

The spread inside a task is larger than most of these changes. The same code gave 75,020, 165,247 and 360,219 tokens on the alarm task. One run set the alarm with a single shell intent, and the others drove the Clock UI.

## Measuring against other tools

I gave Claude Sonnet 5.5 nine jobs that only a phone can do, using each tool in turn. Seven are UI-only: adb, `am`, `cmd`, `settings`, `content` or a browser can't produce the result. Two mixed jobs allow any route. The jobs include setting Chrome's search engine, cropping a photo and testing a sign-up form for planted bugs. Every check reads device state, never the agent's report. [The method has its own post](/blog/benchmarking-ai-agents-on-jobs-only-a-phone-can-do/).

The run is from 10 November 2026, on one `Pixel_Tablet_API_37` emulator at 2560x1600. The agent ran as `claude -p` in Claude Code 2.1.319, one at a time. phonedriver was build `cfa37b2` with three passes. mobile-mcp 1.0.16 had two. Tokens are input plus output plus cache creation plus cache read.

phonedriver passed 27 of 27 runs. mobile-mcp passed 17 of 18, leaving "Always use secure connections" off in one chrome-prefs run. The sums of per-job median tokens are 657,542 and 4,567,199.5, so mobile-mcp used 6.9 times as many. Per job the ratio runs from 2.8x to 11.7x. On 7 November, on an earlier emulator, it was 5.0x. Every run is below; mobile-mcp's median of two is their mean.

| Job | phonedriver, 3 runs (all passed) | mobile-mcp, 2 runs | Ratio of medians |
|---|---|---|---|
| qa-signup | 114,463 / 121,854 / 155,169 | 499,735 / 598,972 | 4.5x |
| qa-shop | 130,476 / 90,917 / 92,570 | 557,674 / 388,516 | 5.1x |
| relay-code | 49,126 / 48,614 / 57,132 | 858,223 / 290,633 | 11.7x |
| chrome-prefs | 98,686 / 91,848 / 98,576 | 1,291,125 (failed) / 813,570 | 10.7x |
| clock-settings | 87,467 / 96,786 / 95,962 | 888,741 / 495,110 | 7.2x |
| messages-pin-archive | 45,240 / 45,107 / 45,618 | 348,059 / 283,060 | 7.0x |
| photos-crop | 61,477 / 51,920 / 79,339 | 786,318 / 487,043 | 10.4x |
| wakelock-restrict | 38,775 / 38,652 / 38,851 | 137,372 / 108,171 | 3.2x |
| log-code | 116,768 / 53,962 / 38,396 | 135,780 / 166,297 | 2.8x |

- **mobile-mcp is also accessibility-first.** It drives apps from the native accessibility tree and takes screenshots only when needed. So the gap is how much comes back and how often it is read again. My notes say its actions returned a screenshot or an element list. I read version 1.0.16 only.
- **Tokens include cache reads, so this is not a cost ratio.** mobile-mcp made 2.8 times as many calls, and each call carried 2.5 times as many tokens (about 16,500 against 6,600). Those two factors multiply to the 6.9.
- **I tuned phonedriver on these jobs and did not tune mobile-mcp.** The fixes are in `docs/bench/jobs.md`.
- **Three and two passes show only large differences.** phonedriver's log-code runs span 38,396 to 116,768. mobile-mcp's relay-code runs span 290,633 to 858,223.
- **One author, one emulator, one day, one model.** The jobs are mine. If you maintain one of these tools and think I set it up wrong, open an issue and I'll rerun it.

phonedriver does not win everywhere. That day phone-harness used fewer tokens on clock-settings (79,931 against 95,962) and messages-pin-archive (42,452 against 45,240). Its total is worse because it failed 4 of 18 runs. Where one shell command does the job, adb is the right tool: in the earlier token run it set an alarm in two calls. mobile-mcp is the better choice if you want cloud devices or the broader action set it documents, and phone-harness suits an agent that already writes Python against a phone.

### What was thrown away

| Run | Why | What I did |
|---|---|---|
| Two phonedriver chrome-prefs runs | The adb tunnel dropped mid-job | Reran them |
| One phonedriver qa-shop run | The emulator process ended | Restarted it and repeated the run |
| The first mobile-mcp passes | They went through a tunnelled adb server, so every tool call failed | Gave the Mac mini its own adb server |
| A second mobile-mcp pass | Guest load of 9 to 16 failed five jobs for device reasons | Rebooted the emulator and repeated it |
| phonedriver's earlier 10 November rerun | A starved emulator; 17 launches answered "not settled" | Not used for the ratio |
| mobile-mcp in the three-task token run | 0 of 3, because its device server did not start | Not compared |
| Two speed attempts on 10 November | A bug in `run_speed.py`; an emulator showing "System UI isn't responding" | Fixed and rerun |

## iOS: my own runner

WebDriverAgent ([WDA](https://github.com/appium/WebDriverAgent)) is itself an XCTest runner: it links XCTest.framework, calls Apple's API to run commands on the device, and takes requests over HTTP. phonedriver's runner is a smaller XCTest bundle with its own protocol, so the mechanism is the same and the framing differs. It is Objective-C on private headers copied from WDA, and NOTICE credits WDA. It is one test method that never returns and serves length-prefixed JSON on TCP port 27753.

I wrote my own to drop protocol overhead; the screen is read the same way. WDA brings a WebDriver HTTP server, an XPath engine and a session model that phonedriver doesn't use, and by default it takes full-depth XML snapshots. The Appium [troubleshooting page](https://appium.github.io/appium-xcuitest-driver/latest/troubleshooting/wda-slowness/) lists the causes of slow page source and the levers, including `snapshotMaxDepth` and excluded attributes.

I measured on an iPhone 17 simulator running iOS 26.5, with Xcode 27.0 and WDA 16.15.3, 50 runs per row, taken in turn. "Fully tuned" means `snapshotMaxDepth` 30, idle waits at 0 and `excluded_attributes=visible,accessible,hittable`.

| Screen | Runner p50 ms | WDA, depth 30 only | WDA, fully tuned | Tuned ÷ runner |
|---|---|---|---|---|
| List (150 elements) | 22.2 | 380.4 | 44.8 | 2.02x |
| Taps (59) | 12.9 | 108.8 | 26.1 | 2.02x |
| Settings (168) | 24.7 | 477.4 | 49.7 | 2.01x |

Against WDA with only `snapshotMaxDepth` set, the runner is 8x to 19x faster. Against fully tuned WDA it is 2.0x at p50, and at p95 it is 2.03x, 1.96x and 1.99x. I had set a bar of 2x for keeping the runner, so the margin over my own bar is about 1%. The first build missed it at 1.91x to 1.93x and cleared it by asking for eight raw accessibility attributes instead of XCTest's key-path mapping. A re-measure on an M4 gave 2.04x to 2.08x, but I did not re-measure WDA there.

Everything here is a simulator. WDA is maintained by Appium and is the better choice if you already run Appium. My runner uses private headers that drift between Xcode releases, so a build failure after an Xcode update is expected maintenance. It needs a Mac with Xcode and your Apple Development team.

Taps cost more on iOS, because XCTest's completion for a synthesized event arrives about 240 ms after the request. A tap takes 357 ms on the Simulator and 450 to 530 ms on a real iPhone, against a target of 80 ms.

## The tap that asks

An agent with a phone can do what your finger can, including tapping Place order. Every screen is also content the agent didn't write. Simon Willison's [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) argues that an agent which reads untrusted content and can act is a risk. A line in the instructions that says to ask first is a rule the model can skip, or that screen text can talk it out of.

So the check is in the tool. When a tap lands on an element whose label says it spends money or can't be undone (`Place order · $34.10`, `Buy with GPay`, `Delete account`), the daemon fails it with `needs_approval`. The MCP server then asks you through the client's own prompt, using MCP elicitation, and the model never sees the question. The label lists cover eleven languages. Send, delete and install are asked about only when you set `PHONEDRIVER_ASK`, because a prompt on every reply teaches people to click Allow without reading.

An icon-only button with no label isn't covered, and neither is a label in another language. A model set on bypassing the guard can pass `autonomous: true`. The guard stops a model that follows the rules or is steered by screen text, and a determined model gets through. Screen text that reads like an instruction to an AI gets an `(ai-instruction)` tag and is kept. The phrase list is English only and can be avoided, so the tag is only a hint. [The approval guard post](/blog/letting-claude-order-dinner-without-letting-it-spend-your-money/) goes through the cases.

## What does not work

- **Back-to-back taps have a long tail.** On the emulator a tap takes 28.7 ms at p50 when taps are 1.5 s apart. Back to back it takes 38.5 ms at p50 and 175.6 ms at p95, because a read right after a tap queues behind the button's ripple. Typing 100 characters takes 158.3 ms, against a 150 ms target I set.
- **The evidence is thin in places.** The main speed run is an emulator. One Android phone, the HONOR X8, was run on hardware, for two operations. The WDA comparison is a simulator. The jobs benchmark has no iOS job and no sign-in flow.
- **My diagnoses were wrong more than once.** I blamed a cold app for swallowing the first tap. The tap landed, and Clock opened its time picker 0.6 to 1.1 s later, after the 500 ms first-change window, so the reply said `no change after 507ms` and the agent tapped again. Actions in the 30 s after `launch` now wait up to 2 s.
- **Runs are noisy.** Three passes can't separate small changes from spread. A rerun on a starved emulator on 10 November raised tokens on several jobs. I traced that to the emulator, but I did not separate device from build, so the 33% drop from 7 November (977,780 to 657,542 tokens) is partly the device.
- **Locked phones.** phonedriver never enters a passcode and can't pass Face ID or a fingerprint check. On a locked phone a command stops.
- **Black screenshots.** A screen that sets `FLAG_SECURE` is black in the frame, though its text is in the tree.
- **Missing trees.** The Photos editor has no accessibility tree, so its screens are screenshots. DailyDroid ([arXiv 2604.17817](https://arxiv.org/abs/2604.17817), one run per task) names missing or incomplete text in the screen representation as the main cause of failure for text-only agents. I didn't measure how often that happens here.
- **Video licensing.** The binary decodes H.264 with OpenH264 built from source, so this build carries no H.264 patent licence.
- **Terms of service.** I make no claim about any app's terms. The agent can do anything you could do with a finger, so use an emulator or a spare phone for unattended runs.

## Reproduce it

Build the testbed app (`testbeds/android`) and install `phone-harness==0.3.3` in a venv for the baseline. The speed run is then one script:

```sh
PH_PYTHON=/path/to/venv/bin/python bash bench/speed/reproduce.sh emulator-5554
```

It builds the device agent and the release binary, runs `bench/speed/run_speed.py`, and writes `bench/speed/out-<timestamp>`. `python3 bench/speed/stats.py <out> --md <out>/tables.md` regenerates the tables and the bootstrap intervals (10,000 resamples, seed 7). The run I quote is in `docs/bench/data/speed-2026-11-11/`: `samples.csv`, `meta.json`, `run.log`, `tables.md`, and `second-pass/` for the two tree rows I measured twice. An unused run from the day before is in `docs/bench/data/speed-2026-11-10/`. [docs/bench/speed.md]({{REPO}}/blob/main/docs/bench/speed.md) explains every row.

The jobs run through `bench/agent-eval/run-harness.sh <phonedriver|mobile-mcp|phone-harness|adb> <task> <out-dir>`, or `run-jobs.sh` for several. They need `PHONEDRIVER_BIN`, `PHONEDRIVER_BENCH`, `ADB_SERVER_SOCKET`, `PH_BIN_DIR`, `MOBILE_MCP_VERSION` and `SERIAL`, and `run-jobs.sh` exits if `ANTHROPIC_API_KEY` is set. Every run in the table above is in `docs/bench/jobs.json` under `same_device_2026_11_10` (passes `p15` to `p17`, `m3` and `m4`), and `python3 bench/agent-eval/jobs/summarize.py p15=<dir> ... --md` rebuilds the tables. [docs/bench/jobs.md]({{REPO}}/blob/main/docs/bench/jobs.md) records the fixes and the discarded runs.

To try it on your own phone:

```sh
claude mcp add phonedriver -- npx -y phonedriver mcp
phonedriver doctor
```

I still don't know how fast a resident UiAutomator2 server reads the same 1,000-row list on the same emulator. That comparison would show how much of the 170 is the resident process and how much is the pruned text. If you run it, open an issue with the samples.
