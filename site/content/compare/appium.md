---
title: phonedriver vs Appium and Appium MCP
seo: phonedriver vs Appium MCP: an Appium alternative for AI agents
updated: 2026-11-17
meta: Appium runs scripted tests over WebDriver and has an MCP server. phonedriver is built for an agent that decides each step. What each does, and one measured row.
description: Appium is the WebDriver framework for scripted mobile tests, and Appium MCP puts it in front of an agent. phonedriver is built for an agent that decides each step from the screen. What each installs, returns and is better at, with the one comparison I measured.
date: 2026-11-14
---

## The short answer

Appium is the better tool for a fixed test suite that runs the same way on every commit, in the language your team writes tests in, on a device farm. phonedriver is built for an agent that looks at a screen, acts and decides from what changed: it returns a short numbered text screen instead of XML page source, waits for the screen to settle after every action, and asks you before a tap that spends money.

I have measured one thing against Appium's stack. On an iPhone 17 simulator, phonedriver's own XCTest runner read a screen 2.0 times faster at p50 than fully tuned WebDriverAgent, the runner Appium uses on iOS. I have not measured Appium on Android, and I have not run Appium MCP on the phone jobs benchmark.

## Side by side

| | phonedriver | Appium and Appium MCP |
|---|---|---|
| What it is | An MCP server and CLI in one Rust binary | A WebDriver server with a driver per platform. Appium MCP is its MCP server (its README) |
| Built for | An agent that decides each step from the screen | Scripted tests. Appium MCP adds tools for an agent and can generate Java/TestNG test code (its README) |
| Platforms | Android, iOS Simulator, iPhone and iPad | Android through UiAutomator2 and iOS through XCUITest in Appium MCP. Appium itself has drivers for more (its README) |
| What it puts on the device | Android: a jar pushed over adb, run as the shell user, no app. iOS: an XCTest runner built on your Mac | Android: the UiAutomator2 server is installed on the device (its driver README). iOS: WebDriverAgent |
| What the model reads | A pruned text list with `@eN` refs, then only the lines that changed | Elements found by locator, and the page source as XML (Appium MCP README) |
| Waits after an action | Yes: settle, then the diff | Not measured. Appium has explicit and implicit waits for elements |
| Approval before spending money | Yes, through MCP elicitation | Not documented in the Appium MCP README |
| Replaying a run | `save` keeps the steps an agent took and `replay` runs them with no model, also in GitHub Actions | Tests are code. Appium MCP can generate Java/TestNG code (its README) |
| Remote devices and farms | A daemon socket forwarded over `ssh`. No cloud devices | Yes: a remote Appium server, CI grids and cloud labs (Appium MCP README) |
| Telemetry | None | Appium MCP has OpenTelemetry tracing, off by default (its README) |
| Requirements | Node 18 or later for `npx`, adb for Android, a Mac with Xcode for iOS | Node 22 or later, a JDK, the Android SDK, Xcode for iOS (Appium MCP README) |
| License | AGPL-3.0-only | Apache-2.0 |
| Adoption | New: first released on 10 November 2026 | Appium has about 22,200 GitHub stars and Appium MCP about 520, on 14 November 2026 |

The Appium rows are from the READMEs of [appium](https://github.com/appium/appium), [appium-mcp](https://github.com/appium/appium-mcp) and [appium-uiautomator2-driver](https://github.com/appium/appium-uiautomator2-driver), read on 14 November 2026. I have not run Appium MCP.

## Measured: reading a screen on iOS

WebDriverAgent is an XCTest runner that takes WebDriver requests over HTTP. phonedriver's runner is a smaller XCTest bundle with its own protocol, so the mechanism is the same and the framing differs. I measured both on an iPhone 17 simulator running iOS 26.5, with Xcode 27.0 and WebDriverAgent 16.15.3, 50 runs per row, taken in turn. "Fully tuned" means `snapshotMaxDepth` 30, idle waits at 0 and three attributes excluded.

| Screen | phonedriver runner, p50 | WebDriverAgent, depth 30 only | WebDriverAgent, fully tuned | Tuned / runner |
|---|---|---|---|---|
| List (150 elements) | 22.2 ms | 380.4 ms | 44.8 ms | 2.02x |
| Taps (59 elements) | 12.9 ms | 108.8 ms | 26.1 ms | 2.02x |
| Settings (168 elements) | 24.7 ms | 477.4 ms | 49.7 ms | 2.01x |

Against WebDriverAgent with only `snapshotMaxDepth` set, the runner is 8 to 19 times faster. This is a simulator, not an iPhone, and a tuned Appium setup is closer than its defaults suggest. The method is in [how phonedriver works](/blog/how-phonedriver-works/#ios-my-own-runner).

## What I have not measured

On Android, Appium's UiAutomator2 server stays resident on the device, as phonedriver's agent does. That makes it the fair rival for phonedriver's 12.7 ms read of a 1,000-row list, and I did not measure it. The 170 times figure on this site is against `adb shell uiautomator dump`, a one-off command, on one Android 17 emulator. It says nothing about Appium.

I also have no token comparison. Appium MCP was not one of the tools in the [nine phone jobs](/benchmarks/#jobs).

## What Appium has that phonedriver does not

- Client libraries in many languages and the W3C WebDriver protocol, so tests are code your team can review and rerun.
- Device farms and cloud labs. phonedriver drives devices you can reach yourself.
- A WebView context: Appium can switch into a web page inside an app and use web locators. phonedriver reads a WebView through the accessibility tree and falls back to OCR when that is empty.
- Test generation in Java, locator strategies and geolocation in Appium MCP (its README).
- Years of use and a large community.

## What phonedriver does differently

- **A settled diff.** Every action waits for the screen to stop changing and returns the lines that changed, so the agent does not fetch the page source again after each tap.
- **Nothing installed on Android.** The agent is a jar pushed over adb and run as the shell user. No APK and no instrumentation.
- **The approval guard.** A tap on Pay, Place order or Delete account is held until you answer. See [the guard](/docs/approval-guard/) and what it does not catch.
- **No telemetry**, checked by a test that runs the tool under a sandbox that kills any non-local connection.
- **A run an agent found, replayed with no model.** `phonedriver save` keeps what an agent did as a steps file and `replay` runs it again; [a GitHub Action](/docs/replay-in-ci/) replays the files on every commit. The steps are found by their text, not written as code.

## Use which

Use Appium when you need a scripted suite, a device farm, or a language binding, or when you already run Appium: WebDriverAgent is maintained by the Appium project, and my iOS runner uses private headers that can break with a new Xcode. Use phonedriver when an agent has to find its own way through an app, when you want fewer tokens spent on reading the screen, and when a person should approve a payment. Android allows one UiAutomation connection at a time, so the two are likely to block each other on the same Android device. I have not tried it.

## Questions

### Is phonedriver built on Appium?

No. phonedriver does not use Appium, the UiAutomator2 server or WebDriverAgent. On Android it runs its own agent over adb, and on iOS it builds its own XCTest runner. That runner copies private headers from WebDriverAgent, which the NOTICE file credits.

### Can an AI agent use Appium directly?

Yes. Appium MCP is an MCP server from the Appium project that starts an Appium session and gives an agent tools to find elements, tap, type and read the page source. I have not run it, so I cannot say how it compares on tokens or passed runs.

### Is phonedriver faster than Appium?

I can answer for one case. On an iPhone 17 simulator, phonedriver's runner read a screen in 12.9 to 24.7 ms at p50 against 26.1 to 49.7 ms for fully tuned WebDriverAgent, which is 2.0 times faster. I have not measured Appium on Android or on a real iPhone.
