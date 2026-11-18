---
title: phonedriver vs Argent
seo: phonedriver vs Argent: an Argent alternative with shorter replies
updated: 2026-11-18
meta: On one iOS Simulator benchmark phonedriver read the screen in 29 ms and 59 tokens, and Argent 0.33.0 in 185 ms and 622 tokens. Platforms, telemetry and license compared.
description: Two MCP servers that let an AI agent drive the iOS Simulator and phones. On simulator-use's benchmark phonedriver read the screen in 29 ms and 59 tokens, and Argent in 185 ms and 622 tokens. Argent has profilers, a debugger, TVs and desktop apps, which phonedriver does not. What each installs and sends, and what I have not measured.
---

## The short answer

**On one iOS Simulator benchmark on 17 November 2026, phonedriver was faster than Argent on every step and its replies were shorter.** A read took 29 ms and 59 tokens against 185 ms and 622 tokens. The step-by-step sign-in took 1.75 s and 173 tokens against 5.33 s and 7,000 tokens. Every step of both tools passed.

Argent, by Software Mansion, does far more than drive a screen. It profiles and debugs apps, inspects network traffic, records and replays e2e tests, and drives TVs, Electron and Chromium apps and native Mac apps. phonedriver does none of that. The benchmark measures five steps on one sign-in screen, which is the part of Argent's job that phonedriver also does.

## Side by side

| | phonedriver | Argent |
|---|---|---|
| Platforms | Android, iOS, the iOS Simulator, Android emulators | iOS simulators, Android emulators and devices, TVs (Apple TV, Android TV, Fire TV), Electron and Chromium apps, native Mac apps (its README) |
| Real devices | iPhone and iPad tested; one Android phone (HONOR X8) tested | Android devices (its README). Physical iPhones over USB, with a subset of the simulator tools; physical iPads not supported yet (its docs, [supported platforms](https://docs.swmansion.com/argent/docs/fundamentals/supported-platforms)) |
| How it reads the screen | Pruned text tree with `@eN` refs, settled; OCR when the tree is empty | Native and React trees (its README). In the benchmark each reply carried an element list with coordinates and a screenshot |
| Reply after an action | The lines that changed | In the benchmark, the screen after the action: a screenshot and the element list |
| Profiling and debugging | None | Hermes, React DevTools, Xcode Instruments, Perfetto; logs, network, JS evaluation (its README) |
| Approval before spending money | Yes, through MCP elicitation | Not documented |
| MCP tools | 17, 1,849 tokens | 71, 36,826 tokens (the benchmark's tool lists) |
| Telemetry | None | On by default: "Telemetry is opt-out: `argent telemetry disable`" (its README) |
| Install | `claude mcp add phonedriver -- npx -y phonedriver mcp`, or Homebrew or a shell installer ([install](/docs/install/)) | `npx @swmansion/argent@latest init` (its README) |
| License | AGPL-3.0-only | Source under Apache-2.0; the `simulator-server` and `ax-service` binaries and some `.dylib` files are proprietary (its README) |
| Adoption | New: first released on 10 November 2026 | About 3.2k GitHub stars, checked on 2026-11-18 |

I read its README, its `Telemetry.md` and its platforms page on 2026-11-18. The repository is [software-mansion/argent](https://github.com/software-mansion/argent).

## Measured

Median time, then median tokens of the replies. The benchmark is simulator-use's own: its harness, its demo app, its five steps on the app's sign-in screen and its scoring script. phonedriver 0.1.5 against Argent 0.33.0, each through its own MCP server, on a Mac mini (Apple M4, 16 GB) with an iPhone 17 Simulator on iOS 26.5, 17 November 2026. Argent's telemetry was turned off for the run. Source: [simulator-2026-11-17]({{REPO}}/blob/main/docs/bench/simulator.md), and the charts are on the [benchmarks page](/benchmarks/#simulator).

| Step | phonedriver | Argent |
|---|---|---|
| Read the sign-in screen | 29 ms, 59 tokens | 185 ms, 622 tokens |
| Tap Sign In | 316 ms, 20 tokens | 656 ms, 627 tokens |
| Type an email | 848 ms, 13 tokens | 2.71 s, 2,173 tokens |
| Sign-in, step by step | 1.75 s, 173 tokens | 5.33 s, 7,000 tokens |
| Sign-in, one batch | 1.78 s, 177 tokens | 4.03 s, 2,902 tokens |
| Tool list | 17 tools, 1,849 tokens | 71 tools, 36,826 tokens |
| First call | 4.95 s | 15.95 s |

At p90 a read took 29 ms for phonedriver and 191 ms for Argent, and a tap 330 ms and 662 ms. Both tools reported the change after all 20 taps.

Three things about these numbers:

- **Argent's replies hold more.** After a tap or a key press Argent sends a screenshot and the whole element list. phonedriver sends the lines that changed. An agent that wants the picture every time gets it from Argent without asking. The harness counts an image as tokens by its size.
- **The tool list is paid once per session.** Argent's 71 tools cover profilers, a debugger, network logs, TVs and Chromium. An agent that uses them gets something for the 36,826 tokens. An agent that only taps and types does not.
- **Argent's first call booted the device.** In the harness its setup is a `boot-device` call and then a launch. phonedriver's first call is a launch, and it starts its XCTest runner first.

Tokens are the replies' characters divided by 4, the harness's count when no API key is set.

## What Argent has that phonedriver does not

From its README and its platforms page, read on 2026-11-18:

- **Profiling**: Hermes, React DevTools, Xcode Instruments and Perfetto, for renders, CPU hotspots and hangs.
- **Debugging**: logs, network requests (`XMLHttpRequest`, `fetch` and native), JS evaluation, native and React trees.
- **React Native**: build, launch and iterate with no extra setup.
- **E2E**: record a path once as an e2e test and replay it. phonedriver has its own form of this, below.
- **Visual regression**: diff a baseline against a live capture.
- **More targets**: Apple TV, Android TV and Fire TV with a D-pad; Electron and Chromium apps; native Mac apps; HarmonyOS, which its docs call experimental and off by default.
- **Adoption**: about 3.2k GitHub stars and a company behind it.

phonedriver has no profiler, no debugger, no network inspection, no screenshot diff and no TV or desktop target.

## What phonedriver does differently

- **A settled diff.** Every action waits for the screen to stop changing and returns the lines that changed, so the agent does not re-read the screen after each tap.
- **Saved runs.** `phonedriver save` writes what the agent did to a file, and `phonedriver replay` runs it again with no model and stops at the first screen that changed. A [GitHub Action](/docs/replay-in-ci/) replays saved runs on every commit.
- **A short tool list.** 17 tools in 1,849 tokens.
- **The approval guard.** phonedriver asks before a tap that spends money. See [the guard](/docs/approval-guard/).
- **No telemetry.** Argent's is on by default and can be turned off. Its privacy notice says it collects which tools are called and the environment, and no tool inputs, file paths or source code.
- **All of it is open source.** phonedriver is AGPL-3.0-only with no closed parts. Argent's README says its source is Apache-2.0 and some of its binaries are proprietary. Apache-2.0 is the more permissive license for the source.
- **iPads.** phonedriver is tested on an iPad. Argent's docs say physical iPads are not supported yet.

## What I have not measured

- This is one run on one Mac, with 10 or 20 samples a step. The medians describe this run and are not rates.
- The app, the steps and the scoring come from simulator-use, a third tool. It is one sign-in screen in a SwiftUI demo app. I have not compared the two on a React Native app, which is what Argent is built around.
- I have not compared them on Android or on a real phone.
- I have not measured Argent's profilers, debugger or visual regression, which phonedriver has nothing to set against, and I have not compared its e2e replay with phonedriver's.
- I have not run an agent on whole jobs with Argent, so I have no pass rates or job token totals.
- The run used Argent 0.33.0. It may have changed since.

If you maintain Argent and think it was set up wrong, open an issue and I will rerun it.

## Use which

Choose Argent if you build a React Native app and want the agent to profile it, debug it and watch its network calls, or if you need TVs, Electron, Chromium or Mac apps. Choose phonedriver if the agent's job is to read and use a phone screen with few tokens, if you want the approval prompt before it spends money, or if you want no telemetry and no closed binaries. The iOS Simulator setup is in [the iOS Simulator guide](/docs/ios-simulator/).

## Questions

### Is phonedriver an Argent alternative?

For driving an app's screen on the iOS Simulator, an iPhone or Android, yes. For profiling, debugging, network inspection, TVs and desktop apps, no: phonedriver has none of those.

### How many tokens does Argent use compared with phonedriver?

On simulator-use's benchmark on 17 November 2026, a read was 622 tokens for Argent and 59 for phonedriver, and the step-by-step sign-in was 7,000 against 173. The tool lists were 36,826 tokens for 71 tools and 1,849 for 17. Argent's replies include a screenshot and the element list after each action. It was one run on one sign-in screen.

### Does Argent collect telemetry?

Yes, by default. Its README says "Telemetry is opt-out: `argent telemetry disable`", and its privacy notice lists what is collected. phonedriver has no telemetry. I turned Argent's off for the benchmark.

### Who makes Argent?

Software Mansion. The repository is [software-mansion/argent](https://github.com/software-mansion/argent), and its README says the source is under Apache-2.0 with some proprietary binaries.
