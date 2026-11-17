# Changelog

Every release of phonedriver, newest first. Binaries and checksums for each version are on [GitHub Releases](https://github.com/hridaya423/phonedriver/releases).

## 0.1.5

Not released yet.

- **`phonedriver init`** adds phonedriver to the agents installed on this machine (Claude Code, Codex, Cursor, VS Code and Gemini CLI) and then runs the doctor checks.
- **`phonedriver boot <name>`** starts an iOS Simulator or an Android virtual device that is off and waits until it has booted. With nothing connected, the error names what can be started.
- **Saved runs**: `phonedriver save run.steps` writes what the session did, and `phonedriver replay run.steps` does it again with no model. It stops at the first step that fails and shows the screen.
- **A GitHub Action**: `uses: hridaya423/phonedriver@v0.1.5` starts an Android emulator or an iOS Simulator, installs your app and replays saved runs on every commit. Each run is a row in the job summary, and its reply, the screen where it stopped and a video go in an artifact.
- **Screen checks in a replay**: `replay run.steps --screens screens/run` keeps a screenshot after each step the first time, and later stops at the first step whose screen shows different text, with the text that changed (`~ "General" → "About"`). The Action takes the folder as `screens`.
- **`phonedriver page`** prints the web page in front as text, whole, without scrolling. On Android, it works in Chrome and in the web views of debug builds.
- **`phonedriver record start` and `record stop`** save an MP4 of the screen on Android and on the iOS Simulator, with a file of the actions done during it.
- **Settings by key on Android 17**: `phonedriver setting find`, `get` and `set` change a setting without opening its screen.
- **App permissions**: `phonedriver apps grant <app> <permission>` and `revoke` work without launching the app.
- **Crashes**: an action during which the app crashed says so in its reply, and `phonedriver logs` prints the app's last lines and its last crash.
- **Several agents on one Android phone**: a device id that ends in `+a`, `+b` and so on gives each agent a hidden screen of its own (Android 13 and later).
- **An Android phone in use stays awake**: while phonedriver has used a phone in the last 10 minutes it resets the phone's screen timeout every 10 seconds, on the phone's own screen and with `PHONEDRIVER_DISPLAY=hidden`, so the phone no longer locks while an agent thinks. The screen still dims on its usual schedule. `phonedriver release` stops it. Tested on a HONOR X8 and the emulator.
- **The emulator's console**: on an Android emulator, `phonedriver shell "emu geo fix -122.41 37.77"` sets the location, and any other console command works the same way (`emu sms send`, `emu power capacity`). On the iOS Simulator, `shell "simctl location set 37.77,-122.41"` does it.
- **Fingerprint and Face ID**: `press fingerprint` and `press wrong-fingerprint` on an Android emulator and on an iOS Simulator.
- **`press landscape` and `press portrait`** turn the screen.
- **Accessibility audit**: `phonedriver snapshot --audit` (MCP: `audit: true`) adds the screen's controls that have no name a screen reader can say and its tap targets under 44 by 44 points on iOS or 48 by 48 on Android.
- **`phonedriver compare a.png b.png`** says in text what changed between two screenshots, in 0.3 to 1.2 s on a Mac. The status bar's clock is left out.
- **Screens with no element list** are read from the screenshot on Windows hosts too, and on Linux hosts with Tesseract installed (the `tesseract-ocr` package), not only on a Mac.
- **Reading a screenshot on a Mac starts at once**: the first read in a process used to wait 21 to 31 s while macOS built the model for Vision's Accurate level, and on some Macs that level failed after 12 to 17 s every time. phonedriver now reads at Vision's Fast level, which needs no such model: about 20 ms a screen on an M4 Pro.
- **An iPhone's signature renews itself**: when the runner's signing has run out (7 days with a free Apple ID), the next command signs it again and installs it. `doctor` shows when it runs out.
- **Passwords**: text typed with `secret` is masked as `•••` in every later reply, error and trace line. An MCP `batch` can now carry a `type` step with `secret`, so one call fills a sign-in form and submits it.
- **Fewer tokens**: a reply says each thing once. A snapshot's header names the keyboard only when it is up and the settle time only when the screen did not settle; the keyboard coming up is one line (`keyboard shown over @e8`); a verified `type` does not repeat the text it typed; a tap's point is in the JSON reply's `at`, not its text. On iOS a snapshot no longer starts with a line naming the app, buttons that get their identifier late keep their refs, and a row whose text changes is one `~` line. On simulator-use's sign-in benchmark phonedriver reads the screen in 59 tokens and signs in with 176 (it was 300); simulator-use's own page gives 72 and 194.
- **Fixed**: `wait "hello"` and `scroll --until "hello"` did not find text typed into a field, though the screen showed it as `textbox "hello"`. They now look in what fields hold, never in a password field.
- **Fixed on iOS**: a system permission prompt over the home screen was listed twice, so `tap "Don’t Allow"` matched two elements.
- **Fixed on iOS**: `launch` of an app that asks for a permission as it starts, such as Maps, waited 13 s and said the app was not in front, because the system's prompt was. It now answers `launched Maps` with the prompt on the screen, 5 s sooner.
- **The iOS Simulator needs only Xcode**: the runner's Xcode project comes with phonedriver, so XcodeGen is no longer needed, and `doctor` no longer asks for it.
- **Fixed on iOS**: Xcode recorded a video of every phonedriver session on a Simulator, as it does for UI tests, and kept it in the Simulator: 1.2 GB on the Mac that ran the tests, up to 209 MB a session. The runner now records nothing.
- **Fixed on iOS**: every start of the runner left a folder in Xcode's DerivedData, and a runner that was stopped left 120 to 250 MB of the Simulator's system logs in it; 84 such folders took 940 MB on the Mac that ran the tests. The runner's logs now stay under `~/.phonedriver/runner`, replaced at each start, and no system logs are gathered. Delete `~/Library/Developer/Xcode/DerivedData/PhonedriverRunner-*` to get back what earlier versions left.
- **Fixed on iPhone**: `launch Settings` matched CarPlay's hidden settings app as well on iOS 27. Apps that iOS hides from the home screen are no longer listed.
- **Fixed on Android**: a screenshot taken right after an action could show the screen from before it.
- **Fixed on Android**: with `PHONEDRIVER_DISPLAY=hidden` on a locked phone, `launch` waited 9 s and blamed the app, and opening the hidden screen turned the phone's screen on. It now says the phone is locked and leaves it asleep. The hidden screen works only while the phone is unlocked. Tested on a HONOR X8.
- **Fixed on Android**: a request the phone never answered waited ten minutes. It now ends as a lost device.
- The third action in a row that changes nothing says so and tells the agent to stop repeating it.
- `launch` waits for an app that is slow to start, and a submit that left the keyboard up says so.
- Every MCP tool refuses an argument it does not know, so a misspelled argument is an error, not silently ignored.
- `phonedriver screenshot shot.png` takes its file as a plain argument.

## 0.1.4

Released 14 November 2026.

- **Fixed on Android 12**: every command that reads the screen failed with `NoSuchMethodException: AccessibilityInteractionClient.clearCache [int]`. The agent now uses whichever `clearCache` the device has. Tested on an Android 12 (API 31) emulator. Reported in #7.
- **An iPhone in use stays awake**: while phonedriver has used an iPhone in the last 10 minutes it resets the phone's Auto-Lock timer every 10 seconds, so the phone no longer locks while an agent thinks. `phonedriver release` stops it. Tested on an iPhone 13 Pro Max with Auto-Lock at 30 seconds.
- **Fixed on iPhone**: a tap that waited for a notification banner could answer with an error although the touch had landed. It now answers `ok`.
- The approval guard is now tested on a physical iPhone: a held, declined or unanswerable tap on Place order reached the app zero times.

## 0.1.3

Released 13 November 2026.

- **iPhone without the cable**: `phonedriver ios wifi on` lets a physical iPhone or iPad answer over Wi-Fi. Unplug it and it stays in `phonedriver devices` while it shares a network with the Mac. Driven on an iPhone 13 Pro Max, iOS 27.0.1; an iPhone 14 Plus on iOS 26.1 was found and answered, with no taps run. A sleeping iPhone stops answering until it wakes. `phonedriver doctor` says which link each device uses.
- **An iPhone the signing team has never seen**: the first command used to wait 60 seconds and point at an Xcode log. It now says the device is not registered and names the fix, `phonedriver ios register`. A locked iPhone at runner start is reported as locked.
- **A locked iPhone says so**: an action on a locked iPhone used to answer "no element matches". It now answers that the device is locked, as Android does.
- **Notification banners on iOS**: a tap that starts under a banner waits for the banner to leave, so it no longer opens the notification.
- **No team ID to look up**: phonedriver reads the signing team from this Mac's Apple Development certificate, so `PHONEDRIVER_TEAM` is needed only with certificates for several teams. The old hint pointed at the ID in parentheses after your name, which is not the team. `phonedriver ios setup` and `phonedriver doctor` print the team they found.
- **`phonedriver ios setup` finishes the job**: after its checks it builds, installs and starts the runner, so the next command answers at once (0.3 s on an iPhone 13 Pro Max) instead of starting the runner itself.
- **MCP annotations**: every tool says whether it only reads the screen or can change something, so a client can run `snapshot`, `screenshot` and `wait` without a permission prompt. `then` is now in the `tap` and `type` schemas, so an agent sees it without the skill.
- **A command you ran by hand no longer blocks your agent**: a device a terminal session has left idle for 30 seconds goes to the next session that asks. It used to stay held for 10 minutes.
- `phonedriver release` with several devices connected gives up every device the session holds. It used to ask which device you mean.
- **Slow links**: when the phone is far away (a mobile network, a relayed tunnel), the screen stream drops from 8 Mbit/s to 400 kbit/s at a smaller size, screen trees travel compressed, and Android tells the host when its screen or lock changes, so a tap makes one round trip fewer. On a link shaped to 3G the median tap on an emulator went from 2.8 s to 1.4 s. On a HONOR X8 the mean went from 2.6 s to 1.7 s and the run sent half the bytes.
- `phonedriver untether` stops at once when the Android phone is on mobile data only, and changes nothing on it.
- `phonedriver untether` waits for adb on the phone to restart. It used to fail about one run in five on a HONOR X8 and work when run again.
- `phonedriver pair` and `phonedriver untether` are now tested on a physical phone (HONOR X8). On a Mac, both restart an adb server that macOS keeps off the local network.
- A phone connected in more than one way (cable, Wi-Fi, port 5555) is one line in `phonedriver devices`, so one phone no longer asks which device you mean. `phonedriver doctor` checks such a phone once.
- `phonedriver ios setup` mounts the developer disk image again with Xcode 27, whose `devicectl` dropped the option the old command passed.

## 0.1.2

Released 12 November 2026.

- **A path of taps in one call**: `tap` and `type` take `then`, a list of texts to tap next, in order. `tap {"target":"More options","then":["Settings","Dark theme"]}` opens the menu, taps Settings and taps Dark theme, and returns one numbered reply. A text that is not on the screen stops the path and returns that screen. A tap that needs approval is still held for the human, and `then` is refused together with `secret`.
- The skill (`phonedriver skill`) tells agents to send a path they can predict as one call.

## 0.1.1

Released 10 November 2026.

- **Fixed on Windows**: `npx -y phonedriver` failed on its first run in a Git Bash shell. The launcher now unpacks the download with the `tar.exe` that Windows ships in `System32`. Before, GNU tar came first on `PATH` there, read `C:\...` as a remote host and could not open the zip.
- A manual CI job installs the published npm package on every release platform (macOS arm64 and x64, Linux x64 and arm64, Windows x64) and runs it.

## 0.1.0

Released 10 November 2026. The first release.

- **Android**: emulators and physical phones and tablets over adb. No app to install and no accessibility service to switch on.
- **iOS**: the Simulator, and physical iPhones and iPads from a Mac with Xcode.
- **14 tools**, the same over MCP and as CLI commands: `devices`, `apps`, `snapshot`, `screenshot`, `tap`, `type`, `swipe`, `scroll`, `press`, `launch`, `wait`, `batch`, `clipboard` and `shell`.
- **Text snapshots**: a screen as numbered lines. Every action waits for the screen to settle and returns only the lines that changed.
- **Approval guard**: a tap on Pay, Buy now, Place order, Transfer or Delete account is held until the human approves it.
- **Secrets**: text typed with `--secret` never reaches logs, traces, errors or replies.
- **No telemetry**, checked by a test that runs the tool in a sandbox that kills any connection that is not local.
- **Install**: `npx -y phonedriver`, Homebrew (`brew install hridaya423/tap/phonedriver`) and release archives for macOS, Linux and Windows.
