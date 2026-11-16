# Spike: two agents on one Android phone, each on its own hidden display

2026-11-16. API 37 emulator (`Pixel_API_37` on win-pc, software GPU, started over ssh), shell user. Throwaway code: one `app_process` program built from the agent's classes, which connected `UiAutomation` once, opened two virtual displays with the flags of D32 and an H.264 encoder each, and drove both from two threads. The code is deleted; this is its record.

## Question

D32 gives one hidden display to one session. Can one on-device agent serve several, so that several sessions work on one phone at the same time, and is that worth building?

## What ran

| Check | Result |
|---|---|
| Two virtual displays, 1080x2424 at 420 dpi, each with its own encoder | Opened in 250 to 470 ms each (3 s for the first one of a cold process). Both encoders produced frames for the whole run: 477 and 440 in about a minute |
| Settings on display A, Clock on display B, the phone's own screen left alone | Both in front 10 to 11 s after the two launches (a slow emulator); the launcher stayed in front on display 0 through every run |
| Reading both trees | 155 nodes in 12 ms and 73 nodes in 6 ms one after the other; 11 ms for both from two threads at once |
| Ten rounds: tap `Network & internet` on A and a Clock tab on B in the same instant, then `back` on A | A entered the page and came back 10 of 10; B's tap landed 10 of 10 and Clock stayed in front. Neither display took the other's input |
| Focus | Each display had its own focused window at the same time (API 34 and later: `OWN_FOCUS`) |
| Keys to A after B was touched last | `w`, `i`, `f`, `i` sent with A's display id typed `wifi` into A's search field with A's own keyboard window up; B did not change. (An earlier run typed `wfiifi`; not explained) |
| Whose event is it | `AccessibilityEvent.getDisplayId()` exists; 224 window events carried A's id, 31 B's, 1 neither |
| The same app on both displays | An ordinary app is one task: launching Settings or the testbed on B, with or without `FLAG_ACTIVITY_MULTIPLE_TASK`, moved it from A to B (`startActivity` returned 3) and left A on the launcher. Chrome, which supports several windows, opened a second window on B and kept the first on A |

One run started in the first seconds after boot coincided with a system-server watchdog restart (`Blocked in handler on ActivityManager for 70s`). Four later runs on the settled emulator did not repeat it, and I did not establish whether the spike caused it.

Not tried: a physical phone; three or more displays; two pastes at once (the clipboard is one per device, so they would need a lock); a hardware encoder's limit on simultaneous sessions; API 33, which has no `OWN_FOCUS`.

## Decision

The mechanics work: one process, one `UiAutomation`, several displays, input and events kept apart by display id. It is not built now (D72), because of the last row. The use that would pay for it is several flows of one app under test on one emulator, and an ordinary app cannot be on two displays. What remains is different apps side by side, which nobody has asked for, at the price of rewriting how the agent process starts, is shared and is stopped, the part of the product where a mistake breaks every user.
