---
title: How to control a real Android phone with phonedriver
nav: Real Android phone
meta: Turn on USB or Wi-Fi debugging, connect an Android phone and let an agent operate it with phonedriver. What has and has not been tested.
description: Turn on USB debugging or Wi-Fi debugging, connect an Android phone or tablet, and let an agent operate it with phonedriver. Notes on what has and has not been tested.
seo: How to let an AI agent control a real Android phone over MCP
updated: 2026-11-14
---

Plug in an Android phone or tablet with USB debugging on, and phonedriver can drive it. No app is installed on the phone, and no accessibility service has to be switched on. It is the same code path as the emulator, and it has been tested on one physical phone, a HONOR X8 ([what was tested](#what-has-been-tested)).

## Over USB

1. On the phone, turn on Developer options, then USB debugging.
2. Plug the phone in and accept the "Allow USB debugging" prompt.
3. Check phonedriver sees it:

```sh
phonedriver devices
phonedriver doctor
```

The phone appears as `android:<serial>`. The daemon pushes a small agent over adb and starts it as the shell user.

## Over Wi-Fi

An Android 11 or later phone on the same network needs no cable. On the phone, turn on Developer options, then Wireless debugging, and choose Pair device with pairing code. Then:

```sh
adb pair 192.168.1.20:37099
adb connect 192.168.1.20:41233
phonedriver devices
```

The first address and the six-digit code are on the pairing screen. The second address is on the Wireless debugging screen, and its port changes each time wireless debugging is switched on. The phone then appears as `android:192.168.1.20:41233`. If it shows `offline`, `phonedriver doctor` says what to check.

`phonedriver pair` does the same with one scan: it shows a QR code, and you choose Pair device with QR code on the phone. `phonedriver untether` switches a phone that is on the cable to adb over TCP, for networks such as Tailscale. I tested both on the HONOR X8 on one Wi-Fi network. On a Mac, both commands restart an adb server that macOS keeps off the local network. A phone connected in more than one way is one line in `phonedriver devices`.

## A hidden screen for the agent

On Android 13 and later, the agent can work on a hidden second screen, so your own screen stays yours. Set `PHONEDRIVER_DISPLAY=hidden` in the MCP config, or pass `--display hidden` to the CLI. It has been tested on an emulator and on the HONOR X8. On the phone, launching Settings and Calculator, tapping, typing, pressing back and home, and taking screenshots all worked on the hidden screen while the phone's own screen kept showing another app.

Typing into an app's own fields leaves no trace on your screen. Typing into a web page shows the system's clipboard note, and your clipboard is put back after. `press lock` and `press notifications` are not available in this mode. The first launch took 8.4 s on the HONOR X8 while the screen and the video encoder started, and later launches settled in about 1.1 s. Switching modes restarts the agent, which takes a few seconds. Some makers' builds may refuse a hidden screen, and I have not tried Xiaomi, Samsung or Oppo phones.

## What has been tested

I have tested one physical Android phone, a HONOR X8 (MagicOS, Android 13), over USB and over Wi-Fi. On it, reading the screen took 78.5 ms against 2,506.6 ms for adb's `uiautomator dump` (32 times faster), and a screenshot took 16.4 ms against 1,005.7 ms for `screencap` (61 times faster). On the phone's main Settings page `uiautomator dump` failed with "could not get idle state" after 11.5 s, and phonedriver read it in 110 ms. That pass covered two operations, not typing or taps, and the full suite of scenarios was run on emulators. Other phones use the same path, and bug reports from them are welcome. The iOS devices I tested are covered on [the iPhone page](/docs/iphone/).

## What stays with you

Unlocking the phone, a USB debugging prompt and a biometric prompt are yours. When one blocks the agent, the error says what to do on the device and the command line exits with code 3. The agent tells you and continues when you say it is done.

## Safety on a real phone

A physical Android device refuses wipes and removing apps phonedriver did not install, unless the command passes `--force`. The [approval guard](/docs/approval-guard/) is on by default, which matters more on a phone with real accounts than on an emulator. Do not hand an agent a phone with a payment app signed in until you have read what the guard does not catch.

## Questions

### Does phonedriver install an app on my Android phone?

No. There is no app and no accessibility service to switch on. The daemon pushes a small jar over adb and starts it with `app_process` as the shell user, the way scrcpy starts its server.

### Do I need root?

No. The agent runs as the shell user, which is what USB debugging gives adb.

### Which Android versions has it been tested on?

Emulators on API 26 and API 37 pass the 21-scenario suite. Release 0.1.4 fixed screen reads on Android 12 and was tested on an API 31 emulator. The one physical phone I have tested is a HONOR X8 on Android 13. Wi-Fi debugging needs Android 11 or later and the hidden screen needs Android 13 or later.

### How fast is it on a real phone?

On the HONOR X8 over USB, reading the screen took 78.5 ms against 2,506.6 ms for `uiautomator dump`, and a screenshot took 16.4 ms against 1,005.7 ms for `screencap` (9 November 2026). Typing and taps were not measured on the phone. The full table, measured on an emulator, is in [phonedriver vs adb](/compare/adb/).
