# Reference

Moved out of the README. Commands use the current binary name, `phonedriver`.

## Install

One line gets you the prebuilt binary. Each artifact has the Android agent inside.

The shortest route is `npx`. The `phonedriver` npm package is a small launcher: on first run it downloads the binary for your platform from GitHub Releases, checks its SHA-256, caches it and runs it. It contacts GitHub only for that download and sends no telemetry.

```sh
npx -y phonedriver init                                   # add it to every agent on this machine, then check the devices
npx -y phonedriver --version                              # try it
claude mcp add phonedriver -- npx -y phonedriver mcp      # or add it to Claude Code by hand
```

`init` looks for five agents and prints one line for each:

```console
$ npx -y phonedriver init
Claude Code  added, for every project
Codex        already there
Cursor       added to /Users/you/.cursor/mcp.json
VS Code      not found
Gemini CLI   not found

Restart your agent so that it loads phonedriver, then ask it: Open Settings and turn on dark mode.
```

The doctor checks follow (`--register-only` leaves them out, `--dry-run` changes nothing). Claude Code and Codex are asked through their own `mcp add` (Claude Code with `--scope user`). Cursor (`~/.cursor/mcp.json`), VS Code (the user profile's `mcp.json`) and Gemini CLI (`~/.gemini/settings.json`) get the entry in their file; the file's other keys are kept, and its keys come back in alphabetical order. A file that is not plain JSON, or that already has another `phonedriver` entry, is not touched: the line says why and prints the entry to paste. Started through `npx`, the entry is `npx -y phonedriver mcp` (`cmd /c npx ...` on Windows); started as an installed binary, it is `phonedriver mcp`, or the binary's full path when that name is not on `PATH`.

The installers below put a permanent `phonedriver` on your `PATH` instead.

```sh
# macOS and Linux
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/hridaya423/phonedriver/releases/latest/download/phonedriver-installer.sh | sh

# Homebrew (macOS and Linux)
brew install hridaya423/tap/phonedriver
```

```powershell
# Windows
powershell -ExecutionPolicy Bypass -c "irm https://github.com/hridaya423/phonedriver/releases/latest/download/phonedriver-installer.ps1 | iex"
```

The shell and PowerShell installers put `phonedriver` in `$CARGO_HOME/bin` (`~/.cargo/bin`) and add it to your `PATH`. The iOS Simulator runner needs no download: its sources are inside the binary, and the first command that needs it builds it on your Mac with Xcode and XcodeGen.

To build from source instead, use Rust 1.99 or later.

```sh
cargo build --release
```

The build packs the Android agent, so it needs the Android SDK with build-tools **37.0.0** and platform **android-37.0** (`ANDROID_HOME`, falling back to `ANDROID_SDK_ROOT`, then `/opt/homebrew/share/android-commandlinetools`), `d8` and JDK 17. Override the versions with `ANDROID_BUILD_TOOLS` and `ANDROID_PLATFORM`. If anything is missing the build says exactly what and how to get it. To skip that step, set `PHONEDRIVER_AGENT_JAR` to a built `phonedriver-agent.jar` (`bash android-agent/build.sh` makes one; none is published yet).

**iOS only, no Android toolchain:**

```sh
cargo build --release -p phonedriver --no-default-features
```

That binary has no Android support (`phonedriver doctor` skips the Android checks). Run the tests with the default features. The binary is `target/release/phonedriver`.

```console
$ target/release/phonedriver version
phonedriver 0.1.5
```

Until the package is published, register the built binary with your client by its full path: `claude mcp add phonedriver -- "$PWD/target/release/phonedriver" mcp`.

Run `phonedriver doctor`. It checks adb, each Android device, the agent, UiAutomation, the video stream, Xcode, the simulators, and the permissions of the daemon socket. Each line says `ok`, `warn` or `fail`, and a fix follows every line that is not `ok`. Without `--device` it starts the agent on every Android device the adb server lists, which replaces an agent another session is using; with `--device <id>` it probes only that one.

```console
$ phonedriver doctor
ok    adb server       0029 at 127.0.0.1:5037
warn  android devices  none connected
      fix: Connect a phone with USB debugging on, or start an emulator; `adb devices` lists what adb sees.
ok    xcode            Xcode 27.0, Build version 27A266a
ok    xcodegen         /opt/homebrew/bin/xcodegen
warn  simulators       none booted
      fix: `phonedriver boot` lists the ones that can be started; `phonedriver boot <name>` starts one.
ok    daemon socket    /Users/you/.phonedriver/run/daemon.sock mode 600 in a directory of mode 700
```

The CLI runs the same loop. `phonedriver skill` prints [`SKILL.md`](../SKILL.md), the instructions an agent reads before it uses the tools.

```sh
phonedriver devices
phonedriver snapshot
phonedriver tap "Dark theme"
phonedriver wait settled
```

### Start a simulator or an emulator

With nothing running, phonedriver starts an iOS simulator (Xcode installed) or an Android virtual device (one made in Android Studio):

```console
$ phonedriver boot
ID                                        MODEL      OS
sim:E02FE8A6-5F1E-405E-A263-2E828218BE5F  iPhone 17  iOS 26.5
$ phonedriver boot "iphone 17"
booted sim:E02FE8A6-5F1E-405E-A263-2E828218BE5F · iPhone 17 · iOS 26.5
```

The name is the model in any case, or the id; when several simulators have the name, the one with the newest system starts. It boots without a window (`open -a Simulator` shows it). Over MCP it is `devices` with `boot: "iPhone 17"`. When nothing is connected, every command's error names what can be started (`no device is connected; can be started: iPhone 17 (iOS 26.5)`), so an agent can start one and go on. Decision D77.

Android virtual devices are in the same list, and start the same way:

```console
$ phonedriver boot
ID                       MODEL                OS
avd:Pixel_API_37         Pixel_API_37         Android API 37
avd:Pixel_Tablet_API_37  Pixel_Tablet_API_37  Android API 37
avd:Pixel_API_31         Pixel_API_31         Android API 31
avd:Pixel_API_26         Pixel_API_26         Android API 26
$ phonedriver boot pixel_api_37
booted android:emulator-5554 · Pixel_API_37 · Android API 37
```

phonedriver runs the SDK's `emulator` program (from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, the folder Android Studio installs to, or the `PATH`) and returns when Android says it has booted. The emulator keeps running after phonedriver's daemon stops; `adb -s emulator-5554 emu kill` stops it. A first boot can take minutes, and on a slow or busy machine the first command after it may still fail while Android settles; a later boot resumes from the emulator's saved state in seconds. With `ADB_SERVER_SOCKET` set (adb on another machine), no virtual device is listed. Decision D79.

### iPhone or iPad

A physical iOS device needs the runner signed with your Apple developer team (a free Apple ID works; its signature lasts 7 days, and the next command after that signs the runner again by itself). Plug the device in, unlock it, then:

```sh
phonedriver ios setup                  # signing team, pairing, Developer Mode, developer disk image, then the runner
phonedriver --device ios:<udid> snapshot
```

phonedriver reads the team from this Mac's Apple Development certificate. To make one, sign in under Xcode > Settings > Accounts, choose Manage Certificates and add an Apple Development certificate. With certificates for several teams, set `PHONEDRIVER_TEAM` to the ID of the one to use. The ID is the certificate's organizational unit. It is not the ID in parentheses that `security find-identity` prints after your name.

Without a team, the command stops with exit code 3 and says so. If the device has never been used with that team, the command stops with exit code 3 and asks for `phonedriver ios register`, which lets Xcode add the device to the team's Apple developer account (an account holds 100 iPhones a year). With a booted Simulator and an iPhone that has no team, the Simulator is the default device. If you set `PHONEDRIVER_TEAM`, run `phonedriver daemon stop` afterwards: the daemon reads it when it starts.

#### iPhone without the cable

After the setup above, with the device still on the cable:

```sh
phonedriver ios wifi on
```

Unplug it. While the device and the Mac are on the same Wi-Fi network, `phonedriver devices` still lists it and every verb works. `phonedriver doctor` says `over Wi-Fi` or `over USB`. The device answers only computers it already trusts. `phonedriver ios wifi off` stops it.

Tested on an iPhone 13 Pro Max (iOS 27.0.1) on one network. An iPhone 14 Plus (iOS 26.1) was found and answered over Wi-Fi; taps on it were not run. A sleeping device stops answering on Wi-Fi until it wakes. phonedriver does not unlock an iPhone. From 0.1.4 it keeps an iPhone awake for 10 minutes after each use and stops on `phonedriver release`; in 0.1.3, set Settings > Display & Brightness > Auto-Lock to Never for a long task. The experimental CoreDevice tier needs the cable.  See decision D47.

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `PHONEDRIVER_HOME` | `~/.phonedriver` | Where the daemon keeps its socket (`run/`), `daemon.log`, `traces/`, `tmp/` and the iOS `runner/` builds. Set it to run a separate daemon. On macOS the socket path must stay under about 100 bytes. |
| `PHONEDRIVER_SOCKET` | under `PHONEDRIVER_HOME` (else `$XDG_RUNTIME_DIR/phonedriver`) | The daemon's socket or named pipe. Point it at an `ssh -L` forward to use a remote machine's devices. |
| `PHONEDRIVER_DEVICE` | none | The device to use when `--device` is not given. Also read by `phonedriver mcp`. `<id>+<name>` is a lane of an Android device ([several agents on one phone](#several-agents-on-one-android-phone)). |
| `PHONEDRIVER_DISPLAY` | `main` | `hidden` makes the Android agent work on a second screen the person holding the phone cannot see (Android 13 and later; `--display hidden` does the same). Read by the CLI, `phonedriver mcp` and `doctor`. A call in the other mode reconnects, which takes a few seconds. Tested on an emulator and a HONOR X8 (Android 13); some makers' builds may refuse it. The phone has to be unlocked: on a locked phone the call fails with "The device is locked" and the phone stays asleep. While the agent works, the phone's own screen is kept on, so the phone does not lock under it (D86). |
| `PHONEDRIVER_SESSION` | `default` | The session name, as `--session`. |
| `PHONEDRIVER_TEAM` | the team of this Mac's Apple Development certificate | Apple developer team ID that signs the iOS runner on a physical device. Needed only with certificates for several teams. |
| `PHONEDRIVER_IOS_TIER` | `runner` | `coredevice` selects the CoreDevice tier on iOS 27 devices. Experimental. |
| `PHONEDRIVER_GUARD` | on | `off` stops phonedriver asking the human before a tap that spends money or cannot be undone (`Place order`, `Pay`, `Delete account`). Set it for `phonedriver mcp` or the CLI only when you grant the agent full autonomy. |
| `PHONEDRIVER_ASK` | none | A comma list of more kinds of tap to ask the human about, besides payments and account deletion: `send` (Send, Reply, Post, Share), `delete` (Delete, Remove, Erase, Clear all) and `install` (Install, Uninstall). For example `PHONEDRIVER_ASK=send,delete`. Read by `phonedriver mcp` and the CLI; a name that is not one of these stops the command with exit code 2. `PHONEDRIVER_GUARD=off` and `autonomous: true` skip these questions too. |
| `PHONEDRIVER_SECRET` | none | The text for `type --secret`, instead of stdin. The daemon shows it as `•••` wherever it later appears on a screen it reads or in a command's output, until the daemon stops; a screenshot still shows what the phone shows. |
| `PHONEDRIVER_TRACE_FULL` | off | `1` keeps observation text and text targets in traces (the daemon reads it at start). |
| `PHONEDRIVER_TRACE_SCREENS` | off | `1` copies every screenshot next to its trace file. |
| `PHONEDRIVER_AGENT_JAR` | built by `android-agent/build.sh` | Build time only: use this prebuilt Android agent jar. |
| `ADB_SERVER_SOCKET` | `tcp:127.0.0.1:5037` | The adb server to use, for example a tunnel to another machine. |
| `PHONEDRIVER_TEST_DEVICE`, `PHONEDRIVER_TEST_IOS_UDID`, `PHONEDRIVER_BENCH`, `PHONEDRIVER_BIN` | none | Tests and benchmarks only. |

The runner's own `PHONEDRIVER_PORT`, `PHONEDRIVER_BUILD` and `PHONEDRIVER_UDID` are set by phonedriver for the iOS runner and are not for you.

## Debugging

When something does not work:

- `phonedriver doctor` checks the toolchain, devices and the socket, and says how to fix each problem.
- `$PHONEDRIVER_HOME/daemon.log` (default `~/.phonedriver/daemon.log`) holds the daemon's own messages and startup errors.
- `$PHONEDRIVER_HOME/traces/<id>.jsonl` has one line per request: method, parameters, the reply's summary, `ms` and settle time. Typed text is recorded only as a length. Start the daemon with `PHONEDRIVER_TRACE_FULL=1` to keep observation text, and `PHONEDRIVER_TRACE_SCREENS=1` to keep screenshots. A running daemon keeps its options: `phonedriver daemon stop` first.
- iOS: `$PHONEDRIVER_HOME/runner/<udid>.log` is the runner's output, and `runner/<hash>/build.log` is its first build.
- `phonedriver daemon stop` stops the daemon and the iOS runners it started. The next command starts a new one.

Exit codes: `0` done, `1` the command failed, `2` the command line is wrong, `3` a person must act on the device (unlock, trust, allow), `4` no matching device or it was disconnected, `5` a tap that spends money or cannot be undone needs the human's approval (add `--autonomous` only when the user has granted full autonomy). On a terminal, a first command that takes more than a second says what it is doing (building the runner, starting the agent).

## Device on another machine, Wi-Fi and shell

### Use a device on another machine

The daemon listens on a Unix socket and nowhere else. To drive a simulator or phone that is plugged into another machine, forward that socket over `ssh` and point the CLI at the local end:

```sh
ssh -N -L /tmp/phonedriver-mini.sock:/Users/you/.phonedriver/run/daemon.sock mini &
export PHONEDRIVER_SOCKET=/tmp/phonedriver-mini.sock
phonedriver snapshot
```

On the other machine, run any `phonedriver` command once, or `phonedriver daemon`, so that the socket exists. Both machines need the same `phonedriver` version. If the forward is down, the error names `PHONEDRIVER_SOCKET`.

Two things differ from a local run. `phonedriver screenshot` prints a path on the machine that has the device; `phonedriver screenshot shot.png` (or `-o shot.png`) writes the file on your machine instead. The MCP `screenshot` tool returns the image itself, so it works unchanged.

### Several agents on one Android phone

Add `+` and a short name to a device id and the session works on a lane: a hidden screen of its own on that phone (Android 13 and later). Each lane has its own lease, so several agents use one phone or emulator at the same time, and the phone's own screen stays free:

```sh
PHONEDRIVER_SESSION=one phonedriver --device emulator-5554+a launch settings
PHONEDRIVER_SESSION=two phonedriver --device emulator-5554+b launch clock
phonedriver devices
```

```console
ID                       MODEL                OS                   TIER   LEASE          DISPLAY
android:emulator-5554    sdk_gphone64_x86_64  Android 17 (API 37)  agent  -              main
android:emulator-5554+a  sdk_gphone64_x86_64  Android 17 (API 37)  agent  one (idle 3s)  hidden (display 13)
android:emulator-5554+b  sdk_gphone64_x86_64  Android 17 (API 37)  agent  two (idle 3s)  hidden (display 12)
```

For MCP, give each agent its own lane in its config: `"env": { "PHONEDRIVER_DEVICE": "emulator-5554+a" }`. With one device connected, `+a` is enough. The name is 1 to 8 lowercase letters or digits. A lane closes, and the apps on it with it, when its session releases it (`phonedriver release`) or has made no call for ten minutes.

On an emulator a lane's video is two pixels a point at 15 frames a second, because an emulator's encoder is software and falls behind at full size; screenshots and text read from pixels are the same as on the main screen, and a recording of a lane is that size.

An app runs in one place at a time. If two lanes launch the same app, it moves to the second one and the first is left on its home screen, so give each lane a different app. The clipboard is one for the phone, so lanes take turns to paste. Tried on one emulator (API 37) with two lanes beside the main screen; not on a physical phone.

### Android over Wi-Fi

An Android 11 or later phone on the same network needs no cable. On the phone, turn on Developer options, then Wireless debugging. `phonedriver pair` shows a QR code in the terminal (the flow Android Studio uses):

```sh
phonedriver pair
```

On the phone choose Wireless debugging, then Pair device with QR code, and scan it. phonedriver finds the phone on the network, pairs, connects, and prints `connected: android:192.168.1.20:41233`. It waits 2 minutes for the scan. Exit code 3 means nobody scanned; 1 means adb's mDNS is unavailable or pairing failed, and the message says what to do. Tested on a HONOR X8 (Android 13).

If the QR does not work (the phone and computer are on different networks, a guest network, or a router that blocks mDNS), pair with the code instead. On the phone choose Pair device with pairing code. Then:

```sh
adb pair 192.168.1.20:37099
adb connect 192.168.1.20:41233
phonedriver devices
```

The first address and the six-digit code are on the pairing screen; the second address is on the Wireless debugging screen (the port changes each time wireless debugging is switched on). The phone then appears as `android:192.168.1.20:41233`. If it shows `offline`, `phonedriver doctor` says what to check.

#### Away from your Wi-Fi

Wireless debugging works only on the Wi-Fi it was switched on for. To use a phone from anywhere you can reach it, for example over [Tailscale](https://tailscale.com), switch the phone to classic adb over TCP while it is connected by cable or already over Wi-Fi:

```sh
phonedriver untether
```

It lists the phone's addresses (`wlan0 (Wi-Fi)`, `tun0 (Tailscale)`), stops if the phone is on mobile data only, runs `adb tcpip 5555`, connects to the first address that answers and prints `connected: android:<ip>:5555`. With more than one device pass `--device android:<serial>`. Tested on a HONOR X8 (Android 13). On a Mac, an adb server that macOS keeps off the local network is restarted by both commands. A phone connected in more than one way (cable, Wi-Fi, port 5555) is one line in `phonedriver devices`; the cable wins, and any of its ids still works with `--device`.

This is opt-in on purpose. adb then listens on port 5555 on every network the phone joins, until it reboots. A new computer still has to be allowed on the phone's screen, but do this only on networks you trust, or with Tailscale on both ends and the phone's other networks untrusted. `adb -s <ip>:5555 usb` or a reboot turns it off. See decision D30.

### Settings by key

On Android 17, the Settings app answers the shell user's `cmd app_function` calls, and phonedriver uses them so an agent can change a setting without opening its screen:

```
phonedriver setting find dark theme                          # keys, what each accepts, and screens
phonedriver setting get dark_ui_mode/dark_ui_activated       # dark_ui_mode/dark_ui_activated = false
phonedriver setting set dark_ui_mode/dark_ui_activated true  # ok dark_ui_mode/dark_ui_activated = true
phonedriver setting find "dark theme|media volume"           # several searches in one call
phonedriver setting set <key> <value> <key> <value>          # several writes in one call
phonedriver setting open dark_ui_mode                        # shows that settings screen
```

The API 37 emulator lists 182 settings on 196 screens; 105 can be written. A write answers with the value the device reports afterwards, and a refusal carries the device's reason. On a physical device, a setting the device marks as needing its user's confirmation (NFC, mobile data, the camera and microphone switches) answers `unsupported` without `--force`. Older Android, iOS and the Simulator answer that the device has no settings by key: use `shell` there. Decision D57.

### Logs and crashes

On Android, `phonedriver logs` prints the last 40 log lines of the app in front (`logs <app>` for another, `--grep "error|warn"`, `--head 0` for all, `--since 300` to read five minutes back) and, first, its last crash. An action during which the app in front crashed carries the crash in its own reply:

```
ok tapped @e6 "Busy" · new screen
alert android: "phonedriver testbed keeps stopping"
...
crashed: dev.phonedriver.testbed stopped during this action: android.app.RemoteServiceException$CrashedByAdbException: shell-induced crash at android.app.ActivityThread.throwRemoteServiceException(ActivityThread.java:2581)
hint: `phonedriver logs dev.phonedriver.testbed` prints its last log lines
```

iOS devices and the Simulator answer that logs cannot be read. Decision D58.

### Screens with no element list

A web view with accessibility off, a Flutter screen or a game gives no list of elements. phonedriver then reads the screenshot's text on the machine the daemon runs on and adds the lines it finds, marked `(ocr)`; `tap "Send"` taps one. `snapshot --pixels` asks for this on any screen. macOS and Windows use the text recognition the system ships. Linux uses Tesseract when the `tesseract` program is on the `PATH` (`apt install tesseract-ocr`); without it, `--pixels` answers that pixels cannot be read and names the package. Decisions D61, D64 and D65.

### What changed between two screenshots

On a screen with no element list, looking again costs a second picture. `compare` answers in text:

```console
$ phonedriver screenshot before.png
$ phonedriver tap "Auto-Capitalisation"
$ phonedriver compare before.png
changed: 1 region, 0.6% of the screen
region 304,592 64x40 (no text changed)
$ phonedriver tap "Auto-Capitalisation"
$ phonedriver compare before.png
same
```

That is a switch that moved and moved back. Where text differs, the reply has a line for each text that changed (`~ "Will turn on when Bedtime starts" → "Will never turn off automatically" at 132,545`), appeared (`+ "General" at 203,86`) or went (`- "Settings" at 84,143`), with the point to tap. At most twelve lines, then `and 14 more`. With one file the screen now is compared with it; with two files nothing is asked of a device. `--image out.png` also writes the later picture with the regions boxed. Over MCP, `screenshot` with `compare: true` compares the screen with the last screenshot that call returned for the same device and sends no image.

The text is read from the pictures by the same recognition as above, so it can misread small or stylized type, and a status bar's clock or signal that changed is reported like any other text. Both pictures must be the same size; take them without `--native` so that the points can be tapped. Decision D76.

### Reading a web page

On Android, `phonedriver page` prints the text of the web page in front, whole, without scrolling:

```
$ phonedriver page --grep "born|died"
page "Ada Lovelace - Wikipedia" https://en.wikipedia.org/wiki/Ada_Lovelace
Born
Augusta Ada Byron
10 December 1815
Died
27 November 1852 (aged 36)
...
```

It is the text a person can read on the page, in reading order, with blank lines dropped. A long page is cut at a line end before 8,000 characters and the reply says how much is left; `--all` prints everything. `--grep "a|b"` keeps the lines with one of the words and the two lines after each, because a page often puts a label and its value on separate lines. In MCP it is `snapshot` with `page: true`, with `find` for the words; MCP has no `all`, so a long page is narrowed with `find`.

It works for Chrome and for a web view inside an app that is a debug build (or that turned web debugging on), because it reads through the debugging socket those open. Any other app answers that it has no page that can be read. It only reads: taps and typing still go through the screen, so the approval guard sees them. iOS has no equivalent yet. Decision D71.

### Saving and replaying a run

`phonedriver save run.steps` writes what the session has done so far to a file, and `phonedriver replay run.steps` does it again with no model:

```
$ phonedriver save run.steps
saved 7 steps to run.steps
1. launch Settings
2. tap "Network & internet"
...
the file holds one step a line: delete the line of a step that was a detour
$ phonedriver replay run.steps
replayed 7 steps in 18.1 s
1. restarted Settings
2. tapped @e4 "Network & internet"
...
screen now:
...
```

Only calls that worked are saved: actions, waits, shell commands, app installs and permission changes, and settings written by key. An element is saved by its text and role, not by its `@ref`, so the file works in a later session. Where no text singles the element out it is saved by position, and `save` says how many such steps there are. `save` lists every step it wrote, so a step that was a wrong turn can be seen and its line deleted from the file. After `save` the session's list starts again empty, so save once before a flow (to a file you throw away) and once after it.

A replay stops at the first step that fails, or that changes nothing where it changed the screen when it was saved. It prints the steps that ran, the screen, and the step to go on from:

```
error: step 3 of 7 (tap "Intranet") failed: no element matches "Intranet"
1. restarted Settings
2. tapped @e4 "Network & internet"
screen now:
...
hint: Do step 3 yourself, then replay the same file from step 4 for the 4 steps left.
$ phonedriver tap "Internet"
$ phonedriver replay run.steps --from 4
```

Text typed with `--secret` is never in the file; a replay stops at that step for you to type it. Other typed text is in the file. In MCP, `replay` takes `file`, `from` and `save: true`. Decision D60.

### Fingerprint and Face ID on an emulator or Simulator

On an Android emulator, `phonedriver press fingerprint` touches the fingerprint sensor with the finger a test enrolls, and `phonedriver press wrong-fingerprint` with another. Enroll by opening fingerprint setup in Settings and pressing `fingerprint` until it says the fingerprint was added; after that the same key passes a fingerprint prompt or unlocks the emulator, and `wrong-fingerprint` fails it. When phonedriver is on another machine than the emulator (adb through `ADB_SERVER_SOCKET`), copy the file `.emulator_console_auth_token` from the home folder of whoever started the emulator into your home folder here: the emulator's console asks for it. A physical phone answers that its sensor takes its owner's finger. Decisions D63 and D68.

On an iOS Simulator the same two keys answer Face ID (or Touch ID): `press fingerprint` shows a face that matches, `press wrong-fingerprint` one that does not, and the system says `Face Not Recognised`. A Simulator with no face enrolled is enrolled by the first press, so when an app says Face ID is not set up, press `fingerprint` once and ask again. An iPhone answers that its Face ID takes its owner. Decision D69.

### Turning the screen

`phonedriver press landscape` turns the screen on its side and `phonedriver press portrait` turns it upright; the reply is the screen as it is afterwards.

```console
$ phonedriver press landscape
ok pressed landscape · new screen
device sim:E02FE8A6-5F1E-405E-A263-2E828218BE5F · iPhone 17 · iOS 26.5 · 874x402pt · landscape
```

An app that supports one orientation only stays as it is, and so does an iPhone's home screen. On Android both keys turn auto-rotate off (`accelerometer_rotation`), because Android ignores a set rotation while it is on; turn it on again in the quick settings or with `setting`. A lane keeps the shape it was made with. Decision D78.

### Recording the screen

On Android and on the iOS Simulator, `phonedriver record start` begins a video of the screen and `phonedriver record stop` finishes it and prints the file:

```
$ phonedriver record start -o run.mp4
recording the screen to /Users/me/run.mp4; `phonedriver record stop` ends it
$ phonedriver launch settings
$ phonedriver scroll down
$ phonedriver record stop
/Users/me/run.mp4
15.2 s, 1080x2424, 150 frames, 3.6 MB
steps: 2 with their times in /Users/me/run.mp4.steps.jsonl
```

The video is the H.264 stream the phone already sends, in an MP4 file, with no sound. It starts with the screen as it was at `record start`. The steps file has one line for each action that succeeded during the recording, such as `{"summary":"scrolled down","t_ms":11119}`: the summary line of the action's reply and when it began, in milliseconds on the video's clock. Text typed with `--secret` is not in it. Without `-o` the file goes under `~/.phonedriver/tmp`, where a starting daemon deletes files older than a day. In MCP, `screenshot` takes `record: "start"` and `record: "stop"`.

A turned screen ends the recording, and `record stop` says so. Stop a recording before you stop the daemon: a daemon that is killed leaves a file players cannot open. The Simulator records itself (`xcrun simctl io recordVideo`): it writes a frame only when the screen changes, so the video of a still screen has one frame, and a turned screen does not end it. An iPhone answers that recording it is not built. Decisions D59 and D66.

### Shell

`phonedriver shell "cmd uimode night yes"` runs a command on the device and prints the exit code, the output (cut at 40 lines; `--grep`, `--head`) and what changed on screen. On Android it runs in the agent already on the device, not in a new `adb shell`. On an iOS Simulator it runs through `simctl spawn`, and `shell "simctl ui appearance dark"` fills in the device for `simctl` subcommands. A physical iPhone has no shell. A physical device refuses wipes and removing apps phonedriver did not install unless you pass `--force`. See `docs/bench/history/shell.md` and decision D21.

## Development

```sh
blaze build
BLAZE_TESTS=all blaze test
cargo clippy --all-targets -- -D warnings
```

Tests that need a device are ignored by default. Set `PHONEDRIVER_TEST_DEVICE` (for example `android:emulator-5554` or `sim:<udid>`) and pass `--ignored`. [`AGENTS.md`](AGENTS.md) holds the rules for working in this repository.

<details>
<summary>Brand</summary>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/logo/display-dark.svg">
    <img alt="The phonedriver wordmark: on the left the letters are orange and ink screen dots, which grow to the right until they become solid letters." src="design/logo/display.svg" width="100%">
  </picture>
</p>

The mark is an invisible chauffeur: a peaked cap floating over a phone and a white glove that taps it, with nobody in between. The glove is the pointing-hand cursor wearing a chauffeur's glove. The wordmark is lettering drawn for phonedriver; in its display form, shown here, it starts as screen dots and resolves into solid letters, because phonedriver reads a screen as text instead of screenshots. [`design/logo/`](design/logo) holds the figure, the icon, the lockup and the display wordmark; [`design/brand.md`](design/brand.md) has the rules; `cd site && node scripts/brand.ts` rebuilds every logo, banner and social image from `site/lib/chauffeur.ts` and `site/lib/brand.ts`. The README charts are built on the [Sodium](https://design.how/systems/sodium) design system (MIT, see [`NOTICE`](NOTICE)) by `python3 design/build/build.py`, with text converted to outlines.

</details>

