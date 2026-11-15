# Replays of saved steps

What `save` and `replay` (decisions D60 and D67) do on the bench's tasks: an agent does a task once and saves its steps, then the steps are run again with no model, from a reset device, and the task's own check decides.

Runner: `bench/agent-eval/replay-eval.sh <out-dir> <replays> <task>...`. For each task it resets the device (`phonedriver-bench eval reset`), runs `claude -p` through `phonedriver mcp` with the task's prompt plus "When that is done, save what you did: call the replay tool with save true and file <path>", checks the device (`eval check`), and then, ten times: reset, `phonedriver replay <file>`, check, cleanup. Every replay starts a daemon of its own, because the bench's reset and check run one too; the times below include that start.

Setup, 2026-11-15: API 37 emulator (`sdk_gphone64_x86_64`, 1080x2424) on win-pc, the daemon and `claude -p` on the Mac mini through the adb tunnel, `claude-sonnet-5-5` on the subscription, `ANTHROPIC_API_KEY` unset, debug builds. The tasks are the eleven in `tasks.yaml` whose check is the device's state alone (no answer to grade), outside the QA jobs.

| Task | Agent run | Agent tokens | Steps saved by | Replays passed | Replay, median |
|---|---|---|---|---|---|
| dark-theme | 9 s, 3 calls | 27,719 | a setting key | 10 of 10 | 3.6 s |
| alarm-0730 | 30 s, 8 calls | 62,112 | text | 10 of 10 | 10.4 s |
| airplane-on-off | 21 s, 4 calls | 33,905 | setting keys | 10 of 10 | 13.6 s |
| files-new-folder | 59 s, 11 calls | 89,623 | text, 1 position | 9 of 10 | 15.2 s |
| compose-third-switch | 15 s, 6 calls | 51,980 | text, 1 position | 10 of 10 | 6.6 s |
| clock-timer-3min | 15 s, 4 calls | 36,365 | text | 10 of 10 | 10.1 s |
| testbed-row-640 | 38 s, 7 calls | 62,198 | text | 10 of 10 | 23.3 s |
| unicode-note | 11 s, 5 calls | 43,224 | text, 1 id | 10 of 10 | 4.1 s |
| alarm-gym | 36 s, 16 calls | 132,660 | text, 11 ids | 10 of 10 | 20.8 s |
| notification-code | 15 s, 5 calls | 45,953 | text, 1 id | 10 of 10 | 6.2 s |
| testbed-web-form | 29 s, 10 calls | 78,426 | 3 ids | 10 of 10 | 12.6 s |

109 of 110 replays passed their check, with no model call in any of them. In all eleven agent runs the agent saved the file when the prompt asked.

Two builds. The first six rows ran on the build before D67, which kept a ref as text and role or as a position. The last five ran on the D67 build, which keeps an id first.

## What failed, and why

- **files-new-folder, replay 2.** `step 1 of 8 (launch Files) failed: connection error: the agent did not print `ready` within 10 s`. The daemon could not start its agent on the device right after the reset cleared two system apps. Nothing in the steps was wrong, and a replay cannot fix it.
- **testbed-web-form on the first build: 0 of 10.** In replay 1, `step 4 of 6 (type "Ada Lovelace" into 150.28,193.52) failed: … android.os.DeadSystemException`: the emulator's system server died, the fault this image has with web views (`docs/bench/history/m2.md`). Replays 2 to 10 and the next four agent runs then failed on a device that was restarting (`the agent exited with code 1 before it was ready`). Those five tasks were run again on the D67 build and are the last five rows. Whether the position target had a part in the crash is not known; the same task saved by id ran ten times without it.
- **A pass thrown away.** A second pass was started and lost: I ran test builds on the Mac mini while it wrote there, the disk filled, and six `check` files could not be written. Its numbers are not used.

## What the saved files look like

- An agent's detours are kept. files-new-folder has eight steps, of which two are launches that did not bring Files to the front and two are shell commands the agent used to look around; all eight run again each time.
- `dark-theme` is one step, the setting write, and replays in 3.6 s, most of it the daemon's start.
- Before D67 a field with no label was a position (`type … into 205.7,476` in the Files dialog; the dialog sat 156 points higher in the replays, where no keyboard was up, and the text landed only because the field already had focus). After D67 the web form's fields are `{"id":"name"}`, `{"id":"agree"}` and `{"id":"send"}`, and no step of the five tasks is a position.

## Not measured

- The same task done by the agent a second time, as the comparison for time: the agent's column is one run each, and it includes the model's thinking, not a daemon start.
- Any app whose screens differ between runs (a feed, a dialog that shows sometimes).
- iOS.
- The nine QA jobs of `jobs.md`: their result is a report or a code read off the screen, which a replay cannot produce.
