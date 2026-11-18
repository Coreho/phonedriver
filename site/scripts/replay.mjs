import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const data = join(root, "docs/bench/data/replay-2026-11-18");
const assets = join(import.meta.dirname, "../public/assets/replay");
const raw = process.argv[2];
const read = (name) => readFileSync(join(data, name), "utf8").replace(/\r/g, "").trimEnd().split("\n");
const reply = (name) => read(name).filter((line) => !line.startsWith("[exit "));
const head = (name) => {
  const lines = reply(name);
  const cut = lines.indexOf("screen now:");
  return [...lines.slice(0, cut < 0 ? lines.length : cut), ...lines.filter((line) => line.startsWith("hint: "))];
};
const PASSES = ["pass1", "pass2", "pass3"];

if (raw) {
  const keep = readdirSync(data).filter((name) => name === "windows-host.txt");
  const kept = keep.map((name) => readFileSync(join(data, name)));
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  keep.forEach((name, i) => writeFileSync(join(data, name), kept[i]));
  for (const name of readdirSync(raw)) if (/\.(txt|steps|jsonl)$/.test(name) || name === "now.png") copyFileSync(join(raw, name), join(data, name));
  cpSync(join(raw, "screens/network"), join(data, "screens"), { recursive: true });
  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  for (const pass of PASSES) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(raw, `${pass}.mp4`), "-vf", "scale=360:-2,fps=24", "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", join(assets, `${pass}.mp4`)]);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-sseof", "-0.15", "-i", join(assets, `${pass}.mp4`), "-frames:v", "1", "-q:v", "5", join(assets, `${pass}.jpg`)]);
    const length = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(assets, `${pass}.mp4`)], { encoding: "utf8" });
    writeFileSync(join(data, `${pass}.length.txt`), `${Math.round(Number(length) * 1000)}\n`);
  }
}

const session = reply("session.txt");
const saved = session.slice(session.lastIndexOf("$ phonedriver save network.steps"));
const steps = saved.filter((line) => /^\d+\. /.test(line)).map((line) => line.replace(/^\d+\. /, ""));
const second = head("second.txt");
const failed = /step (\d+) of \d+/.exec(second.join("\n"));
const change = /^~ (.*) at (\d+),(\d+)$/m.exec(second.join("\n"));
if (!failed || !change) throw new Error("the last replay did not stop on a changed screen");
const stops = Number(failed[1]);
const [w, h] = [0.17, 0.018];
const passes = PASSES.map((pass) => {
  const length = Number(read(`${pass}.length.txt`)[0]);
  const marks = read(`${pass}.mp4.steps.jsonl`).map((line) => JSON.parse(line));
  return {
    src: `/assets/replay/${pass}.mp4`,
    poster: `/assets/replay/${pass}.jpg`,
    length,
    steps: steps.map((_, i) => ({ t: marks[i]?.t_ms ?? length - 500, at: marks[i]?.at ? [Math.round((marks[i].at.x / 411) * 1e4) / 1e4, Math.round((marks[i].at.y / 923) * 1e4) / 1e4] : null })),
  };
});
const out = {
  file: "network.steps",
  steps,
  stops,
  passes,
  matched: reply("again.txt").find((line) => line.includes("matched")),
  change: change[1],
  box: [Number(change[2]) / 411 - w / 2, Number(change[3]) / 923 - h / 2 + 0.005, w, h].map((v) => Math.round(v * 1e4) / 1e4),
  first: head("again.txt"),
  second,
};
writeFileSync(join(import.meta.dirname, "../lib/replay.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${steps.length} steps, stopped at ${stops}: ${change[1]}`);
