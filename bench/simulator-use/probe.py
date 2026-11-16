#!/usr/bin/env python3
"""phonedriver through the steps of simulator-use's benchmark, counted its way (decision D85).

The steps are those of bench/run.mjs in github.com/NoMac-app/simulator-use (MIT): read the sign-in screen of its
examples/swiftui-demo app, tap Sign In, type the email, and the whole sign-in step by step and as one batch, each
from a freshly started app. Tokens are characters / 4 of what each tool call answers, as on its page when no API
key is set. Build and install that demo app on a booted Simulator first, then:

    probe.py <path to phonedriver> <simulator udid> [runs]

SHOW=1 prints every reply.
"""
import json, math, os, statistics, subprocess, sys, time

BIN, UDID = sys.argv[1], sys.argv[2]
RUNS = int(sys.argv[3]) if len(sys.argv) > 3 else 5
BUNDLE, EMAIL, PASSWORD = "dev.simtap.demo", "gary@example.com", "secret1"
SHOW = os.environ.get("SHOW") == "1"


class Mcp:
    def __init__(self):
        env = dict(os.environ, PHONEDRIVER_DEVICE=f"sim:{UDID}")
        self.p = subprocess.Popen([BIN, "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env)
        self.n = 0
        self.init = self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                            "clientInfo": {"name": "probe", "version": "0"}})
        self.p.stdin.write((json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n").encode())
        self.p.stdin.flush()

    def rpc(self, method, params):
        self.n += 1
        self.p.stdin.write((json.dumps({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params}) + "\n").encode())
        self.p.stdin.flush()
        while True:
            msg = json.loads(self.p.stdout.readline())
            if msg.get("id") == self.n:
                return msg

    def call(self, name, args):
        t0 = time.perf_counter()
        r = self.rpc("tools/call", {"name": name, "arguments": args})
        ms = (time.perf_counter() - t0) * 1000
        res = r.get("result", {})
        text = "\n".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
        images = [c for c in res.get("content", []) if c.get("type") == "image"]
        if "error" in r:
            text = json.dumps(r["error"])
        if SHOW:
            print(f"--- {name} {json.dumps(args)} ({ms:.0f} ms, {len(text)} chars, {len(images)} images, error={res.get('isError')})\n{text}")
        return {"ms": ms, "chars": len(text), "text": text, "images": len(images), "error": bool(res.get("isError") or "error" in r)}


def fresh():
    subprocess.run(["xcrun", "simctl", "terminate", UDID, BUNDLE], capture_output=True)
    subprocess.run(["xcrun", "simctl", "launch", UDID, BUNDLE], capture_output=True, check=True)
    time.sleep(1.5)


def tokens(calls):
    return sum(math.ceil(c["chars"] / 4) for c in calls)


def summary(name, runs, ok):
    ms = [sum(c["ms"] for c in r) for r in runs]
    tk = [tokens(r) for r in runs]
    print(f"{name:28} median {statistics.median(ms)/1000:.2f} s  tokens {statistics.median(tk):.0f}  ok {sum(ok)} of {len(ok)}  calls {len(runs[0])}")


m = Mcp()
tools = m.rpc("tools/list", {})["result"]["tools"]
defs = sum(len(json.dumps({"name": t["name"], "description": t.get("description", ""), "input_schema": t["inputSchema"]})) for t in tools)
instr = len(m.init["result"].get("instructions", ""))
print(f"tool list: {len(tools)} tools, definitions {math.ceil(defs/4)} tokens, instructions {math.ceil(instr/4)} tokens, in all {math.ceil(defs/4)+math.ceil(instr/4)}")

fresh()
warm = m.call("snapshot", {"diff": False})
print(f"warm-up read {warm['ms']:.0f} ms")

reads = [[m.call("snapshot", {"diff": False})] for _ in range(RUNS * 2)]
summary("read the screen", reads, [not r[0]["error"] for r in reads])

taps, ok = [], []
for _ in range(RUNS * 2):
    fresh(); m.call("snapshot", {"diff": False})
    c = m.call("tap", {"target": "Sign In", "role": "button"})
    taps.append([c]); ok.append("Invalid email or password" in c["text"])
summary("tap (shows the result)", taps, ok)

types, ok = [], []
for _ in range(RUNS):
    fresh(); m.call("snapshot", {"diff": False})
    c = m.call("type", {"text": EMAIL, "into": "Email"})
    types.append([c]); ok.append(EMAIL in c["text"])
summary("type (text shown)", types, ok)

flows, ok = [], []
for _ in range(RUNS):
    fresh()
    calls = [m.call("snapshot", {"diff": False}),
             m.call("type", {"text": EMAIL, "into": "Email"}),
             m.call("type", {"text": PASSWORD, "into": "Password", "secret": True}),
             m.call("tap", {"target": "Sign In", "role": "button"}),
             m.call("snapshot", {"diff": False})]
    flows.append(calls); ok.append("Welcome, gary@example.com" in calls[-1]["text"] and not any(c["error"] for c in calls))
summary("sign in, step by step", flows, ok)
print("  per call tokens:", [math.ceil(c["chars"] / 4) for c in flows[-1]], "ms:", [round(c["ms"]) for c in flows[-1]])

flows, ok = [], []
for _ in range(RUNS):
    fresh()
    calls = [m.call("snapshot", {"diff": False}),
             m.call("batch", {"steps": [{"tool": "type", "text": EMAIL, "into": "Email"},
                                         {"tool": "type", "text": PASSWORD, "into": "Password", "secret": True},
                                         {"tool": "tap", "target": "Sign In", "role": "button"}]}),
             m.call("snapshot", {"diff": False})]
    flows.append(calls); ok.append("Welcome, gary@example.com" in calls[-1]["text"] and not any(c["error"] for c in calls))
summary("sign in, batched", flows, ok)
print("  per call tokens:", [math.ceil(c["chars"] / 4) for c in flows[-1]], "ms:", [round(c["ms"]) for c in flows[-1]])
