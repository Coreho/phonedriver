---
title: phonedriver vs simulator-use
seo: phonedriver vs simulator-use: an alternative that also drives real phones
updated: 2026-11-18
meta: On simulator-use's own benchmark phonedriver read the screen in 29 ms against 45 ms and tapped in 316 ms against 435 ms. simulator-use typed faster, 578 ms against 848 ms.
description: Two MCP servers that let an AI agent use the iOS Simulator. On simulator-use's own benchmark phonedriver was faster at reading and tapping, and simulator-use was faster at typing, at the one-batch sign-in and at the first call. What each builds, installs and sends, and what I have not measured.
---

## The short answer

**On simulator-use's own benchmark, on one Mac on 17 November 2026, each tool won some steps.** phonedriver read the sign-in screen in 29 ms against 45 ms and tapped in 316 ms against 435 ms. simulator-use typed in 578 ms against 848 ms, finished the one-batch sign-in in 1.35 s against 1.78 s, and answered its first call in 81 ms against 4.95 s. The step-by-step sign-in was 1.75 s for phonedriver and 1.78 s for simulator-use.

simulator-use is built for the iOS Simulator: it builds the Xcode project, runs its tests and reads its logs. Its README lists real devices and Android under what it can't do yet. phonedriver runs the same commands on the Simulator, an iPhone, an iPad and an Android phone. If you only work in the Simulator on your own Xcode project, simulator-use does more of that job.

## Side by side

| | phonedriver | simulator-use |
|---|---|---|
| Platforms | Android, iOS, the iOS Simulator, Android emulators | The iOS Simulator only, as an iPhone or an iPad (its README) |
| Real devices | iPhone and iPad tested; one Android phone (HONOR X8) tested | No: "Real devices, Android" are on its list of what it can't do yet (its README) |
| How it reads the screen | Pruned text tree with `@eN` refs, settled; OCR when the tree is empty | One line per element with kind, label, `#id`, state and `@x,y` (its README) |
| Waits after an action | Yes: settle, then the diff | Yes: a step waits until the pixels stop changing, and `ui_act` answers with what changed (its README) |
| How it types on the Simulator | Through XCTest's text input, as on an iPhone; the on-screen keyboard comes up | Keys on the Simulator's hardware keyboard port; what a US keyboard lacks goes through the clipboard (the [benchmark notes]({{REPO}}/blob/main/docs/bench/simulator.md) and its README) |
| Builds and tests an Xcode project | No tool for it; it installs a built `.app` ([testing your app](/docs/test-a-mobile-app/)) | Yes: `app_run` builds, installs and launches; `tests_run` runs XCTest and Swift Testing case by case (its README) |
| Test runner on the device | Its own XCTest runner, built with Xcode on first use | None: "There is no test runner to build" (its README) |
| Approval before spending money | Yes, through MCP elicitation | Not documented |
| MCP tools | 17 | 12; "a dozen tools" (its README) |
| Telemetry | None | None for the local tools: "There is no telemetry and no network access at runtime". Cloud mode sends the project and the tools' calls to NoMac (its README) |
| Install | `claude mcp add phonedriver -- npx -y phonedriver mcp`, or Homebrew or a shell installer ([install](/docs/install/)) | `claude mcp add simulator-use -- npx -y simulator-use mcp`; needs macOS with Xcode, a Simulator runtime and Node 20 or newer (its README) |
| License | AGPL-3.0-only | MIT (its README) |
| Adoption | New: first released on 10 November 2026 | 6 GitHub stars, checked on 2026-11-18 |

I read its README on 2026-11-18, when it described release 0.18.0. The benchmark ran 0.17.0.

## Measured

Median time, then median tokens of the replies. simulator-use's harness, demo app, five steps and scoring script, with phonedriver added as one more tool. phonedriver 0.1.5 against simulator-use 0.17.0, each through its own MCP server, on a Mac mini (Apple M4, 16 GB) with an iPhone 17 Simulator on iOS 26.5, 17 November 2026. Every step of both tools passed. Source: [simulator-2026-11-17]({{REPO}}/blob/main/docs/bench/simulator.md), and the charts are on the [benchmarks page](/benchmarks/#simulator).

| Step | phonedriver | simulator-use | Ahead |
|---|---|---|---|
| Read the sign-in screen | 29 ms, 59 tokens | 45 ms, 71 tokens | phonedriver |
| Tap Sign In | 316 ms, 20 tokens | 435 ms, 17 tokens | phonedriver on time, simulator-use on tokens |
| Type an email | 848 ms, 13 tokens | 578 ms, 14 tokens | simulator-use on time |
| Sign-in, step by step | 1.75 s, 173 tokens | 1.78 s, 192 tokens | phonedriver |
| Sign-in, one batch | 1.78 s, 177 tokens | 1.35 s, 177 tokens | simulator-use on time |
| Tool list | 17 tools, 1,849 tokens | 12 tools, 2,443 tokens | phonedriver |
| First call | 4.95 s | 81 ms | simulator-use |

At p90 a read took 29 ms for phonedriver and 52 ms for simulator-use, and a tap 330 ms and 453 ms. Tokens are the replies' characters divided by 4, the harness's count when no API key is set.

## Where simulator-use is faster, and why

- **Typing, and the batch, which types twice.** simulator-use presses keys on the Simulator's hardware keyboard port, and iOS answers a hardware key by hiding the on-screen keyboard. phonedriver types through XCTest's text input, as it does on an iPhone, so the on-screen keyboard comes up. Its reply waits for the keyboard to finish rising, about half of the type step after a fresh launch, and says what the keyboard covers.
- **The first call**, a launch of the app. phonedriver first starts its XCTest runner on the Simulator, the runner it drives an iPhone with, and later calls reuse it. simulator-use has no runner to start.
- **A tap's reply** is 3 tokens shorter for simulator-use. phonedriver also says what a changed element showed before.

I tried hardware keys for phonedriver and dropped them. With the Simulator's hardware keyboard turned off, apps started afterwards ignored shift, so `Ga@m` came out `ga2m`.

## What simulator-use has that phonedriver does not

From its README, read on 2026-11-18:

- **The build loop.** `app_run` finds the Xcode project, builds it, installs it, launches it and answers with the first screen. Build errors come back as `file:line`.
- **Tests.** `tests_run` runs unit and UI tests and reports each case, with failures as `file:line`.
- **Screen recording.** `screen_record` starts and stops a video and answers with the MP4.
- **In-app purchases** through StoreKit Testing, applied from the app's `.storekit` file.
- **Simulator settings in one tool**: permissions, location, push, locale, time zone, text size and a clean status bar.
- **A cloud iPhone Simulator** on NoMac, billed per minute, for Linux, Windows and CI, and a GitHub Action that uses it.
- **No runner build.** Its first call is as fast as the rest.

phonedriver has no tool for building, running tests, StoreKit or a cloud phone. It records video from its command line (`phonedriver record`), not from an MCP tool, and it reaches `simctl` through its `shell` tool ([the iOS Simulator guide](/docs/ios-simulator/)).

## What phonedriver does differently

- **The same commands on a phone.** An agent that learned the Simulator with phonedriver drives an iPhone, an iPad or an Android phone the same way. On the Simulator it types the way a phone does.
- **The approval guard.** phonedriver asks before a tap that spends money. See [the guard](/docs/approval-guard/).
- **Saved runs.** `phonedriver save` writes what the agent did to a file, and `phonedriver replay` runs it again with no model and stops at the first screen that changed. A [GitHub Action](/docs/replay-in-ci/) replays saved runs on every commit.
- **Android.** A resident agent on the device, with its own numbers on the [benchmarks page](/benchmarks/).

## What I have not measured

- This is one run on one Mac, with 10 or 20 samples a step. The medians describe this run and are not rates.
- The app, the steps and the scoring are simulator-use's own. It is one sign-in screen. I have not compared the tools on a long list, a web view or a real project.
- There is no real-phone comparison, because simulator-use lists real devices and Android as not supported.
- I have not measured its build, test, recording or cloud tools, and I have not run an agent on whole jobs with it, so I have no pass rates or job token totals.
- The run used 0.17.0. Its README now describes 0.18.0, which I have not run.

If you maintain simulator-use and think it was set up wrong, open an issue and I will rerun it.

## Use which

Choose simulator-use if your work is an Xcode project in the iOS Simulator and you want one tool to build it, run its tests and record it, with fast typing and no runner to build. Choose phonedriver if the agent also has to work on a real iPhone, an iPad or Android, or if you want the approval prompt before it spends money. On the Simulator, reads and taps were faster with phonedriver in this run, and typing was faster with simulator-use.

## Questions

### Is phonedriver faster than simulator-use?

On some steps. On simulator-use's own benchmark on 17 November 2026, phonedriver read the screen in 29 ms against 45 ms and tapped in 316 ms against 435 ms. simulator-use typed in 578 ms against 848 ms, did the one-batch sign-in in 1.35 s against 1.78 s and answered its first call in 81 ms against 4.95 s. It was one run on one Mac.

### Is phonedriver a simulator-use alternative?

For reading and using an app's screen in the iOS Simulator, yes. For building an Xcode project and running its tests, no: phonedriver has no tools for those. phonedriver adds real iPhones, iPads and Android, which simulator-use's README lists as not supported.

### Does simulator-use work on a real iPhone or on Android?

Not according to its README, read on 2026-11-18: "Real devices, Android, rotating to landscape, pinch and multi-touch" are under what it can't do yet.

### Why does phonedriver type slower in the Simulator?

It types through XCTest, as it does on an iPhone, and waits for the on-screen keyboard to finish rising before it replies. simulator-use presses keys on the Simulator's hardware keyboard, which hides the on-screen keyboard.
