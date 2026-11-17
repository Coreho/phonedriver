# iOS Simulator, against simulator-use, agent-device and Argent

Run on 17 November 2026 with simulator-use's own benchmark: its harness (MIT), its demo app, its five steps on the app's sign-in screen and its scoring script, with phonedriver added as one more tool. The page with the charts is [phonedriver.dev/benchmarks](https://phonedriver.dev/benchmarks/#simulator).

## Setup

- Harness: the `bench` folder of [simulator-use](https://github.com/NoMac-app/simulator-use) 0.17.0, with the changes below. `bash bench/run-all.sh <folder> phonedriver simulator-use agent-device argent`, then `node bench/summarize.mjs <folder>`.
- Tools, each through its own MCP server, one at a time: phonedriver 0.1.5 (release build of main at `74918ad`), simulator-use 0.17.0, agent-device 0.21.39, Argent 0.33.0.
- Machine: Mac mini (Apple M4, 16 GB), macOS 27.0.1, Xcode 27.0. Simulator: iPhone 17 device type, iOS 26.5 (23F73), booted headless with `simctl boot`, Device Hub closed. The harness reboots the Simulator before each tool.
- `DO_NOT_TRACK=1`, and Argent's telemetry turned off.
- Tokens: the replies' characters divided by 4, the harness's count when no API key is set.
- Steps, each checked by the app's own log or the tool's next read:
  - read: the sign-in screen, unchanged, 20 times;
  - tap: Sign In with empty fields, after a fresh launch and an untimed read, 20 times;
  - type: an email into the Email field, after a fresh launch and an untimed read, 10 times;
  - sign-in step by step: read, type the email, type the password, tap Sign In, read; 10 times;
  - sign-in in one batch: the same, with the three actions in the tool's batch call; 10 times.

## Results

Median time, then median tokens of the replies. Every step of every tool passed.

| Tool | Read | Tap | Type | Sign-in, step by step | Sign-in, one batch | Tool list | First call |
|---|---|---|---|---|---|---|---|
| phonedriver 0.1.5 | **29 ms**, **59** | **316 ms**, 20 | 848 ms, **13** | **1.75 s**, **173** | 1.78 s, **177** | 17 tools, **1,849** | 4.95 s |
| simulator-use 0.17.0 | 45 ms, 71 | 435 ms, **17** | **578 ms**, 14 | 1.78 s, 192 | **1.35 s**, **177** | 12 tools, 2,443 | **81 ms** |
| agent-device 0.21.39 | 33 ms, 125 | 872 ms, 38 | 2.43 s, 47 | 5.67 s, 762 | 4.78 s, 546 | 63 tools, 27,918 | 1.39 s |
| Argent 0.33.0 | 185 ms, 622 | 656 ms, 627 | 2.71 s, 2,173 | 5.33 s, 7,000 | 4.03 s, 2,902 | 71 tools, 36,826 | 15.95 s |

p90s and every call with its reply are in the data files.

## Where simulator-use is faster

- **Typing, and the batch, which types twice.** simulator-use presses keys on the Simulator's hardware keyboard port, and iOS answers a hardware key by hiding the on-screen keyboard. None of simulator-use's replies reports a keyboard (its diff prints `keyboard: shown` when one appears), and its last read lists the tab bar as on screen. phonedriver types through XCTest's text input, as it does on an iPhone, so the on-screen keyboard comes up and covers the bottom of the screen. Its reply waits for the keyboard to finish rising, about half of the type step after a fresh launch, and says what it covers (`keyboard shown over @e8`); the next read marks the tab bar `under-keyboard`.
- Hardware keys with the on-screen keyboard kept up were tried for phonedriver and dropped: with the Simulator's hardware keyboard turned off, apps started afterwards ignored shift, so `Ga@m` came out `ga2m`, whether shift went as a key or as SimulatorKit's modifier message. Apps started before the change typed it right. D93 had already found hardware keys curling quotes and turning `--` into a dash.
- **The first call**, a launch of the app: phonedriver first starts its XCTest runner on the Simulator, the runner it drives an iPhone with, and later calls reuse it.
- **A tap's reply** is 3 tokens shorter for simulator-use: phonedriver says what a changed element showed before as well (`~ @e7 cell "Not signed in" → "Invalid email or password"`).

Real devices and Android are on simulator-use's own list of [what it can't do yet](https://github.com/NoMac-app/simulator-use#what-it-cant-do-yet). phonedriver runs the same commands on an iPhone, an iPad and an Android phone, so on the Simulator it types the way a phone does.

> It's called **simulator**-use. This is **phone**driver.

## Before D93

The same harness earlier on 17 November, with phonedriver taps and settles going through XCTest (as in 0.1.4): read 117 ms, tap 842 ms, type 1,211 ms, sign-in step by step 3.63 s, in one batch 4.35 s; tokens as above.

## Changes to the harness

The whole diff is [`bench/simulator-use/harness.patch`](../../bench/simulator-use/harness.patch).

- `tools/phonedriver.mjs` drives phonedriver the way its MCP instructions say: read with `snapshot`, tap and type by the text the screen shows, and type the password with `secret: true`.
- Before each tool the harness stops leftover processes by name. The Mac runs other work, so the stop is limited to processes of the benchmark's own tool folder and Simulator.
- Device Hub is left alone instead of quit. It was closed for every run, and each results file records that.
- agent-device's adapter passes its selector at the top level, the form agent-device 0.21.38 and later take. With the adapter as published, every agent-device tap and type failed with "target was removed; pass the UI target at the top level".

## Data

`docs/bench/data/simulator-2026-11-17/`: `summary.json` and `summary.md` from `summarize.mjs`, and for each tool `<tool>.json` (every call with its reply and time) and `<tool>.tools.json` (its tool list). Two edits from the harness's output: the list of leftover processes it stopped is removed, and the home folder in paths is written `~`.

This is one run on one Mac, 10 or 20 samples a step, so the medians describe this run and are not rates. If you maintain one of these tools and think it was set up wrong, open an issue and I will rerun it.
