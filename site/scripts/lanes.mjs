import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATE = "2026-11-18";
const TAIL = 1400;
const root = join(import.meta.dirname, "../..");
const data = join(root, `docs/bench/data/lanes-${DATE}`);
const assets = join(import.meta.dirname, "../public/assets/lanes");
const raw = process.argv[2];
const read = (name) => readFileSync(join(data, name), "utf8").replace(/\r/g, "").trim();
const LANES = [
  { id: "a", app: "Settings" },
  { id: "b", app: "Clock" },
  { id: "c", app: "Contacts" },
  { id: "d", app: "Files" },
  { id: "e", app: "Phone" },
];

if (raw) {
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  for (const name of readdirSync(raw)) if (/\.(tsv|jsonl)$/.test(name) || ["wall.txt", "load.txt", "devices.txt", "recstart.txt"].includes(name)) copyFileSync(join(raw, name), join(data, name));
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "80", join(raw, "main.png"), "--out", join(data, "main.jpg")], { stdio: "ignore" });
  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  const [t0, t1] = read("wall.txt").split(" ").map(Number);
  for (const { id } of LANES) {
    const first = JSON.parse(read(`${id}.mp4.steps.jsonl`).split("\n")[0]).t_ms;
    const sent = Number(read(`log-${id}.tsv`).split("\n")[0].split("\t")[2]);
    const from = Math.max(0, first - (sent - t0)) / 1000;
    const length = (t1 - t0 + TAIL) / 1000;
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(from), "-i", join(raw, `${id}.mp4`), "-t", String(length), "-vf", "scale=320:-2,fps=20", "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", join(assets, `${id}.mp4`)]);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-sseof", "-0.2", "-i", join(assets, `${id}.mp4`), "-frames:v", "1", "-q:v", "5", join(assets, `${id}.jpg`)]);
    writeFileSync(join(data, `${id}.offset.txt`), `${Math.round(from * 1000)}\n`);
  }
  execFileSync("sips", ["--resampleWidth", "360", join(data, "main.jpg"), "--out", join(assets, "main.jpg")], { stdio: "ignore" });
}

const [t0, t1] = read("wall.txt").split(" ").map(Number);
const lanes = LANES.map((lane) => {
  const from = Number(read(`${lane.id}.offset.txt`));
  const taps = read(`${lane.id}.mp4.steps.jsonl`).split("\n").map((line) => JSON.parse(line));
  const steps = read(`log-${lane.id}.tsv`).split("\n").map((row, i) => {
    const [, n, sent, done, code, cmd] = row.split("\t");
    if (code !== "0") throw new Error(`lane ${lane.id} step ${n} failed`);
    const tap = taps[i];
    return { t0: Number(sent) - t0, t1: Number(done) - t0, cmd, at: tap?.at ? [Math.round((tap.at.x / 411) * 1e4) / 1e4, Math.round((tap.at.y / 923) * 1e4) / 1e4, tap.t_ms - from] : null };
  });
  return { ...lane, src: `/assets/lanes/${lane.id}.mp4`, poster: `/assets/lanes/${lane.id}.jpg`, steps };
});
const devices = read("devices.txt").split("\n").length - 1;
writeFileSync(join(import.meta.dirname, "../lib/lanes.json"), JSON.stringify({ date: DATE, device: "android:emulator-5554", wall: t1 - t0, length: t1 - t0 + TAIL, screens: devices, main: "/assets/lanes/main.jpg", lanes }, null, 1) + "\n");
console.log(`wall ${t1 - t0} ms`, lanes.map((l) => `${l.id}: ${l.steps.length}`).join(" "));
