import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const data = join(root, "docs/bench/data/replay-2026-11-18");
const assets = join(import.meta.dirname, "../public/assets/replay");
const read = (name) => readFileSync(join(data, name), "utf8").replace(/\r/g, "").trimEnd().split("\n");
const sips = (from, to) => execFileSync("sips", ["--resampleWidth", "360", "-s", "format", "jpeg", "-s", "formatOptions", "80", join(data, from), "--out", join(assets, to)], { stdio: "ignore" });
const reply = (name) => read(name).filter((line) => !line.startsWith("[exit "));

const head = (name) => {
  const lines = reply(name);
  const cut = lines.indexOf("screen now:");
  return [...lines.slice(0, cut < 0 ? lines.length : cut), ...lines.filter((line) => line.startsWith("hint: "))];
};
const session = reply("session.txt");
const saved = session.slice(session.lastIndexOf("$ phonedriver save network.steps"));
const steps = saved.filter((line) => /^\d+\. /.test(line)).map((line) => line.replace(/^\d+\. /, ""));
const second = head("second.txt");
const failed = /step (\d+) of \d+/.exec(second.join("\n"));
const at = /^~ .* at (\d+),(\d+)$/m.exec(second.join("\n"));
if (!failed || !at) throw new Error("the second replay did not stop on a changed screen");
const size = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", join(data, "now.png")], { encoding: "utf8" });
const width = Number(/pixelWidth: (\d+)/.exec(size)[1]);
const height = Number(/pixelHeight: (\d+)/.exec(size)[1]);
const scale = width / 411;
const [x, y] = [Number(at[1]) * scale, Number(at[2]) * scale];
const [w, h] = [0.17, 0.018];
const stops = Number(failed[1]);
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
sips(`screens/${String(stops).padStart(2, "0")}.png`, "kept.jpg");
sips("now.png", "now.jpg");
const out = {
  file: "network.steps",
  saved: saved[1],
  steps,
  stops,
  first: head("first.txt"),
  second,
  changed: "after Wi-Fi was turned off",
  kept: { src: "/assets/replay/kept.jpg", alt: "The Network & internet page of Settings as the first replay kept it. The Internet row says AndroidWifi." },
  now: { src: "/assets/replay/now.jpg", alt: "The same page in the later replay, with Wi-Fi off. The Internet row says T-Mobile, the text that stopped the replay." },
  box: [x / width - w / 2, y / height - h / 2 + 0.005, w, h].map((v) => Math.round(v * 1e4) / 1e4),
};
writeFileSync(join(import.meta.dirname, "../lib/replay.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${steps.length} steps, stopped at ${stops}, change at ${at[1]},${at[2]}`);
