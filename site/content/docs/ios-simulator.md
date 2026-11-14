---
title: How to control the iOS Simulator with phonedriver
nav: iOS Simulator
meta: Boot an iPhone Simulator on a Mac and let an agent drive it with phonedriver. Needs Xcode and XcodeGen. Covers the runner build and tap latency.
description: Boot an iPhone Simulator on a Mac and let an agent drive it with phonedriver. Needs Xcode and XcodeGen. Covers the first-run runner build and the Simulator's tap latency.
seo: How to let an AI agent control the iOS Simulator over MCP
updated: 2026-11-14
---

To let an AI agent control the iOS Simulator, boot a Simulator on a Mac with Xcode and add phonedriver to your agent as an MCP server. The agent reads the screen as text and taps through an XCTest runner that phonedriver builds for you. The iOS Simulator is a tested target: the 12-scenario suite passes on iOS 26.5, three runs in a row. One scenario, `settings-dark-appearance`, failed twice in six full runs and I have not found the cause.

## What you need

A Mac with Xcode (I use Xcode 27) and XcodeGen (`brew install xcodegen`). There is no Android toolchain involved: the iOS-only build (`--no-default-features`) skips it.

## Boot a Simulator

Boot one in Simulator.app, or:

```sh
xcrun simctl list devices available
xcrun simctl boot <udid>
```

Then:

```sh
phonedriver devices
phonedriver snapshot
```

The first command that needs the runner builds a small XCTest runner on your Mac. The sources are inside the phonedriver binary, so nothing is downloaded. The command says what it is doing if it takes more than a second. The build log is at `~/.phonedriver/runner/<hash>/build.log` and the runner's output at `~/.phonedriver/runner/<udid>.log`.

## Use the shell

`phonedriver shell "simctl ui appearance dark"` runs through `simctl spawn`, and fills in the device for `simctl` subcommands. See [the shell](/docs/shell/).

## Speed

A tap on the iOS 26.5 Simulator takes 357 ms, against 80 ms for the Simulator's own tool, because XCTest takes about 240 ms to confirm the event. Screenshots and the diff after a tap meet the targets I set. If speed on iOS matters, read [the benchmarks](/benchmarks/) before you decide.

## If it does not work

Run `phonedriver doctor`. It checks Xcode, XcodeGen and the booted simulators. With a booted Simulator and an iPhone that has no signing team, the Simulator is the default device. More in [troubleshooting](/docs/troubleshooting/).

## Questions

### Can Claude Code control the iOS Simulator?

Yes. Boot a Simulator, run `claude mcp add phonedriver -- npx -y phonedriver mcp`, and ask. Claude Code gets the screen as a numbered text list and taps by number. See [the Claude Code guide](/docs/claude-code/).

### Do I need idb or WebDriverAgent?

No. phonedriver builds its own XCTest runner with Xcode and XcodeGen the first time it is needed. Its sources are inside the phonedriver binary, so nothing is downloaded.

### Can I install my app on the Simulator with it?

Yes. `phonedriver apps install` takes the `.app` folder your build produces, and `phonedriver launch` opens it. See [testing your app](/docs/test-a-mobile-app/).
