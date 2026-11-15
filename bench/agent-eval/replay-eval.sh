#!/usr/bin/env bash
# Usage: bench/agent-eval/replay-eval.sh <out-dir> <replays> <task>...
# For each task: one agent run through `phonedriver mcp` that ends by saving its steps, then <replays> runs of
# `phonedriver replay` with no model, each from a reset device and each checked by the task's device-state check.
# Needs PHONEDRIVER_BIN, PHONEDRIVER_BENCH and ADB_SERVER_SOCKET; the adb serial in SERIAL. The bench's reset and
# check run a daemon of their own, so the daemon of the run is stopped before each of them: the wall time of a
# replay includes starting one.
set -u
[ -z "${ANTHROPIC_API_KEY:-}" ] || { echo "ANTHROPIC_API_KEY is set" >&2; exit 1; }
out=$1; replays=$2; shift 2
serial=${SERIAL:-emulator-5554}
here=$(cd "$(dirname "$0")" && pwd)
tasks=$here/tasks.yaml
mkdir -p "$out"; out=$(cd "$out" && pwd)
dev=android:$serial
bench() { "$PHONEDRIVER_BENCH" eval "$@"; }
stop_daemon() { for p in $(lsof -t "$1/run/daemon.sock" 2>/dev/null); do kill "$p" 2>/dev/null; done; sleep 1; }
: >"$out/empty.txt"
for task in "$@"; do
  steps=$out/$task.steps
  home=$(mktemp -d); workdir=$(mktemp -d)
  export PHONEDRIVER_HOME=$home
  if [ ! -s "$steps" ]; then
    bench reset "$tasks" "$task" "$PHONEDRIVER_BIN" "$dev" >"$out/$task.reset.txt" 2>&1 || echo "reset failed: $(cat "$out/$task.reset.txt")" >&2
    stop_daemon "$home"
    prompt="$(bench prompt "$tasks" "$task") When that is done, save what you did: call the replay tool with save true and file $steps."
    cat >"$out/$task.mcp.json" <<J
{"mcpServers":{"phonedriver":{"command":"$PHONEDRIVER_BIN","args":["mcp"],"env":{"PHONEDRIVER_HOME":"$home","PHONEDRIVER_DEVICE":"$dev","ADB_SERVER_SOCKET":"$ADB_SERVER_SOCKET"}}}}
J
    start=$(date +%s)
    (cd "$workdir" && claude -p "$prompt" --append-system-prompt "The target device is the Android emulator with adb serial $serial. Use only that device." \
        --mcp-config "$out/$task.mcp.json" --strict-mcp-config --allowedTools "mcp__phonedriver__*" --tools "" \
        --disable-slash-commands --setting-sources "" --no-session-persistence --model claude-sonnet-5-5 \
        --output-format stream-json --verbose --max-turns 40 >"$out/$task.jsonl" 2>"$out/$task.stderr") &
    pid=$!
    ( sleep 600; kill "$pid" 2>/dev/null ) &
    wd=$!
    wait "$pid" 2>/dev/null
    kill "$wd" 2>/dev/null
    wall=$(( $(date +%s) - start ))
    stop_daemon "$home"
    if bench check "$tasks" "$task" "$PHONEDRIVER_BIN" "$dev" "$out/empty.txt" "$out/$task.jsonl" >"$out/$task.check.txt" 2>&1; then ok=true; else ok=false; fi
    bench cleanup "$tasks" "$task" "$PHONEDRIVER_BIN" "$dev" >/dev/null 2>&1
    stats=$("$PHONEDRIVER_BENCH" stats "$out/$task.jsonl")
    python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d.update(task=sys.argv[2], run="agent", success=sys.argv[3]=="true", wall_s=int(sys.argv[4]), saved=sys.argv[5]=="true"); d.pop("answer",None); print(json.dumps(d))' \
      "$stats" "$task" "$ok" "$wall" "$([ -s "$steps" ] && echo true || echo false)" | tee -a "$out/results.jsonl"
  fi
  [ -s "$steps" ] || continue
  for i in $(seq 1 "$replays"); do
    bench reset "$tasks" "$task" "$PHONEDRIVER_BIN" "$dev" >"$out/$task.reset.txt" 2>&1 || echo "reset failed: $(cat "$out/$task.reset.txt")" >&2
    start=$(python3 -c 'import time; print(time.time())')
    "$PHONEDRIVER_BIN" --device "$dev" replay "$steps" >"$out/$task.replay-$i.txt" 2>&1; code=$?
    took=$(python3 -c 'import time,sys; print(round(time.time()-float(sys.argv[1]),1))' "$start")
    stop_daemon "$home"
    if bench check "$tasks" "$task" "$PHONEDRIVER_BIN" "$dev" "$out/empty.txt" >"$out/$task.check-$i.txt" 2>&1; then ok=true; else ok=false; fi
    bench cleanup "$tasks" "$task" "$PHONEDRIVER_BIN" "$dev" >/dev/null 2>&1
    python3 -c 'import json,sys; print(json.dumps(dict(task=sys.argv[1], run=int(sys.argv[2]), exit=int(sys.argv[3]), success=sys.argv[4]=="true", wall_s=float(sys.argv[5]))))' \
      "$task" "$i" "$code" "$ok" "$took" | tee -a "$out/results.jsonl"
  done
done
