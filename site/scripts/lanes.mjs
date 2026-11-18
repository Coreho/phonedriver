import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATE = "2026-11-18";
const root = join(import.meta.dirname, "../..");
const data = join(root, `docs/bench/data/lanes-${DATE}`);
const assets = join(import.meta.dirname, "../public/assets/lanes");
const [raw, serial] = process.argv.slice(2);
const read = (dir, name) => readFileSync(join(dir, name), "utf8").replace(/\r/g, "");
const sips = (from, to, ...ops) => execFileSync("sips", [...ops, "-s", "format", "jpeg", "-s", "formatOptions", "80", from, "--out", to], { stdio: "ignore" });
const LANES = [
  { id: "a", session: "one", who: "agent one, in Settings", alt: "The hidden screen of agent one at the end of the run: the Android version page of Settings, with Android version 17." },
  { id: "b", session: "two", who: "agent two, in Clock", alt: "The hidden screen of agent two at the end of the run: a timer in the Clock app, counting down from six minutes." },
];

if (raw) {
  rmSync(data, { recursive: true, force: true });
  mkdirSync(join(data, "frames"), { recursive: true });
  const [t0, t1] = read(raw, "wall.txt").trim().split(" ").map(Number);
  const offset = Number(read(raw, "offset.txt").trim());
  for (const name of readdirSync(raw)) if (/\.(tsv|txt)$/.test(name)) copyFileSync(join(raw, name), join(data, name));
  if (serial) for (const name of ["wall.txt", "log-a.tsv", "log-b.tsv", "load.txt"]) copyFileSync(join(serial, name), join(data, `serial-${name}`));
  sips(join(raw, "main-0.png"), join(data, "main-before.jpg"));
  sips(join(raw, "main-mid.png"), join(data, "main-during.jpg"));
  for (const { id } of LANES) {
    let last = "";
    for (const name of readdirSync(join(raw, "frames")).filter((n) => n.startsWith(`${id}-`)).sort()) {
      const at = Number(name.slice(2, -4)) - offset - t0;
      if (at < -300 || at > t1 - t0 + 2500) continue;
      const sum = createHash("md5").update(readFileSync(join(raw, "frames", name))).digest("hex");
      if (sum === last) continue;
      last = sum;
      sips(join(raw, "frames", name), join(data, "frames", `${id}-${String(Math.max(0, Math.round(at))).padStart(6, "0")}.jpg`));
    }
  }
}

const [t0, t1] = read(data, "wall.txt").trim().split(" ").map(Number);
const wall = t1 - t0;
const serialWall = existsSync(join(data, "serial-wall.txt")) ? Number(read(data, "serial-wall.txt").trim().split(" ")[2]) : 0;
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
sips(join(data, "main-during.jpg"), join(assets, "main.jpg"), "--resampleWidth", "360");
const lanes = LANES.map((lane) => {
  const steps = read(data, `log-${lane.id}.tsv`).trim().split("\n").map((row) => {
    const [, n, from, to, code, cmd] = row.split("\t");
    if (code !== "0") throw new Error(`lane ${lane.id} step ${n} failed`);
    return { t0: Number(from) - t0, t1: Number(to) - t0, cmd, reply: read(data, `${lane.id}-${n}.txt`).split("\n")[0] };
  });
  const frames = readdirSync(join(data, "frames")).filter((n) => n.startsWith(`${lane.id}-`)).sort().map((name) => {
    sips(join(data, "frames", name), join(assets, name), "--resampleWidth", "360");
    return { t: Math.min(Number(name.slice(2, -4)), wall), src: `/assets/lanes/${name}` };
  });
  const within = frames.filter((f, i) => f.t < wall || i === frames.length - 1);
  return { ...lane, steps, frames: within };
});
const devices = read(data, "devices.txt").trim().split("\n").slice(1).map((row) => {
  const cells = row.trim().split(/\s{2,}/);
  return [cells[0], cells[4], cells[5]];
});
const out = {
  date: DATE,
  device: devices[0][0],
  wall,
  serial: serialWall,
  rate: 2,
  main: { alt: "The phone's own screen during the run: the home screen, as it was before the agents started.", frames: [{ t: 0, src: "/assets/lanes/main.jpg" }] },
  lanes,
  devices,
};
writeFileSync(join(import.meta.dirname, "../lib/lanes.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`wall ${wall} ms, serial ${serialWall} ms`, lanes.map((l) => `${l.id}: ${l.steps.length} steps, ${l.frames.length} frames`).join("; "));
