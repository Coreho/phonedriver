const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const sharp = require("sharp");

const here = __dirname;
const run = JSON.parse(fs.readFileSync(path.join(here, "reads.capture.json"), "utf8"));

const W = 1680;
const H = 880;
const FPS = 12;
const CELL = 4;
const SCREEN_W = 332;
const SCREEN_H = Math.round((SCREEN_W * run.screen.h) / run.screen.w / CELL) * CELL;
const PHONE = { x: 96, y: (H - SCREEN_H - 28) / 2, w: SCREEN_W + 28, h: SCREEN_H + 28, r: 46 };
const SCREEN = { x: PHONE.x + 14, y: PHONE.y + 14 };
const TEXT_X = 540;
const FONT = 24;
const LINE = 37;
const CHAR = FONT * 0.602;
const MAX_CHARS = Math.floor((W - TEXT_X - 40) / CHAR);

const THEMES = {
  dark: { paper: "#141412", ink: "#f5f3ee", accent: "#ff5b14", dark: "#141412", bright: "#f5f3ee" },
  light: { paper: "#ffffff", ink: "#161512", accent: "#e04a08", dark: "#161512", bright: "#ffffff" },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function tone(t, light) {
  const [lo, hi] = [channels(t.dark), channels(t.bright)];
  return `rgb(${lo.map((v, i) => Math.round(v + (hi[i] - v) * light)).join(",")})`;
}

async function halftone(file, t) {
  const cols = SCREEN_W / CELL;
  const rows = SCREEN_H / CELL;
  const { data } = await sharp(path.join(here, file))
    .resize(cols, rows, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Array(16).fill(0);
  for (const v of data) counts[v >> 4]++;
  const ground = counts.indexOf(Math.max(...counts)) * 16 + 8;
  const span = Math.max(ground, 255 - ground);
  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = data[r * cols + c];
      const apart = clamp((Math.abs(v - ground) / span) * 1.6, 0, 1);
      if (apart < 0.1) continue;
      const rad = (CELL / 2) * (0.35 + 0.65 * Math.sqrt(apart));
      const mark = ground / 255 + ((v < ground ? 0 : 1) - ground / 255) * Math.min(1, apart * 1.4) ** 0.6;
      out += `<circle cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="${rad.toFixed(2)}" fill="${tone(t, mark)}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W}" height="${SCREEN_H}"><rect width="${SCREEN_W}" height="${SCREEN_H}" fill="${tone(t, ground / 255)}"/>${out}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function wrapped(text) {
  if (text.length <= MAX_CHARS) return [text];
  const arrow = text.lastIndexOf(" → ", MAX_CHARS);
  const at = arrow > 0 ? arrow : text.lastIndexOf(" ", MAX_CHARS);
  return [text.slice(0, at), ...wrapped(`    ${text.slice(at + 1)}`)];
}

function styled(cut, t) {
  if (cut.startsWith("$ ")) {
    return `<tspan fill="${t.ink}" fill-opacity="0.45">$ </tspan><tspan fill="${t.ink}" font-weight="bold">${esc(cut.slice(2))}</tspan>`;
  }
  return esc(cut)
    .replace(/@e\d+/g, (m) => `<tspan fill="${t.accent}">${m}</tspan>`)
    .replace(/^(\s*)([~+-])(?= )/, (_, s, m) => `${s}<tspan fill="${t.accent}" font-weight="bold">${m}</tspan>`);
}

function timeline() {
  const scanStart = 1.0;
  const scanEnd = 3.6;
  const yAt = (s) => ((s - scanStart) / (scanEnd - scanStart)) * run.screen.h;
  const at = (y) => scanStart + (y / run.screen.h) * (scanEnd - scanStart);
  const lines = [{ text: `$ ${run.snapshot_command}`, t: 0.25, typed: true }];
  let last = scanStart;
  for (const l of run.snapshot) {
    last = l.y != null ? at(l.y) : last + 0.08;
    for (const text of wrapped(l.text)) lines.push({ text, t: last });
  }
  const tapTyped = scanEnd + 0.9;
  const tapAt = tapTyped + 1.0;
  const flip = tapAt + 0.35;
  lines.push({ text: `$ ${run.tap_command}`, t: tapTyped, typed: true, gap: true });
  run.reply.forEach((whole, i) => {
    for (const text of wrapped(whole)) lines.push({ text, t: flip + 0.45 + i * 0.22 });
  });
  const end = flip + 0.45 + run.reply.length * 0.22 + 2.6;
  return { lines, scanStart, scanEnd, yAt, tapAt, flip, end };
}

function frame(s, t, tl, img) {
  const k = SCREEN_W / run.screen.w;
  const scanY = clamp(tl.yAt(s), 0, run.screen.h) * k;
  const scanning = s >= tl.scanStart && s <= tl.scanEnd;
  const flipped = clamp((s - tl.flip) / 0.3, 0, 1);
  const fadeOut = clamp((tl.end - s) / 0.5, 0, 1);
  const lit = s < tl.scanStart ? 0 : scanY;
  let text = "";
  let row = 0;
  for (const l of tl.lines) {
    if (l.gap) row += 0.45;
    const y = 78 + row * LINE;
    row++;
    if (s < l.t) continue;
    const age = s - l.t;
    const shown = l.typed ? l.text.slice(0, Math.max(2, Math.floor(age * 42))) : l.text;
    const o = l.typed ? 1 : ease(clamp(age / 0.22, 0, 1));
    text += `<text x="${TEXT_X + (1 - o) * 14}" y="${y}" fill="${t.ink}" fill-opacity="${(0.9 * o).toFixed(2)}" xml:space="preserve">${styled(shown, t)}</text>`;
    if (l.typed && shown.length < l.text.length) {
      text += `<rect x="${TEXT_X + shown.length * CHAR + 2}" y="${y - FONT + 4}" width="${CHAR * 0.6}" height="${FONT}" fill="${t.accent}"/>`;
    }
  }
  const tap = run.tap;
  const tapAge = s - tl.tapAt;
  let ripple = "";
  if (tapAge >= 0 && tapAge < 0.9) {
    const p = tapAge / 0.9;
    ripple =
      `<circle cx="${tap.x * k}" cy="${tap.y * k}" r="${7 + 46 * ease(p)}" fill="none" stroke="${t.accent}" stroke-width="${4 * (1 - p)}"/>` +
      `<circle cx="${tap.x * k}" cy="${tap.y * k}" r="${9 * (1 - p * 0.5)}" fill="${t.accent}" fill-opacity="${1 - p}"/>`;
  }
  const scan = scanning
    ? `<rect x="0" y="${scanY - 26}" width="${SCREEN_W}" height="26" fill="url(#trail)"/><rect x="-6" y="${scanY - 1.5}" width="${SCREEN_W + 12}" height="3" fill="${t.accent}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
<defs>
<linearGradient id="trail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity="0"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0.28"/></linearGradient>
<clipPath id="screen"><rect width="${SCREEN_W}" height="${SCREEN_H}" rx="30"/></clipPath>
<clipPath id="read"><rect width="${SCREEN_W}" height="${lit}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="${t.paper}"/>
<g opacity="${fadeOut}">
<rect x="${PHONE.x}" y="${PHONE.y}" width="${PHONE.w}" height="${PHONE.h}" rx="${PHONE.r}" fill="none" stroke="${t.ink}" stroke-opacity="0.9" stroke-width="3"/>
<g transform="translate(${SCREEN.x} ${SCREEN.y})" clip-path="url(#screen)">
<image width="${SCREEN_W}" height="${SCREEN_H}" xlink:href="${img.a}" opacity="0.32"/>
<g clip-path="url(#read)"><image width="${SCREEN_W}" height="${SCREEN_H}" xlink:href="${img.a}"/></g>
<rect width="${SCREEN_W}" height="${SCREEN_H}" fill="${t.paper}" opacity="${flipped}"/>
<image width="${SCREEN_W}" height="${SCREEN_H}" xlink:href="${img.b}" opacity="${flipped}"/>
${scan}${ripple}
</g>
<g font-family="Menlo" font-size="${FONT}">${text}</g>
</g>
</svg>`;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reads-figure-"));
  const tl = timeline();
  const total = Math.ceil(tl.end * FPS);
  const only = process.argv[2] === "--frame" ? Number(process.argv[3]) : null;
  for (const [name, t] of Object.entries(THEMES)) {
    const img = { a: await halftone(run.before, t), b: await halftone(run.after, t) };
    const files = [];
    for (let i = 0; i < total; i++) {
      if (only != null && i !== only) continue;
      const file = path.join(tmp, `${name}-${String(i).padStart(3, "0")}.png`);
      await sharp(Buffer.from(frame(i / FPS, t, tl, img))).png().toFile(file);
      files.push(file);
    }
    if (only != null) {
      fs.copyFileSync(files[0], path.join(process.argv[4] || tmp, `reads-${name}-${only}.png`));
      continue;
    }
    const args = ["-loop", "0", "-lossy", "-q", "82", "-m", "6", "-min_size", "-d", String(Math.round(1000 / FPS))];
    execFileSync("img2webp", [...args, ...files, "-o", path.join(here, `reads-${name}.webp`)]);
    console.log(name, total, "frames", fs.statSync(path.join(here, `reads-${name}.webp`)).size, "bytes");
  }
  fs.rmSync(tmp, { recursive: true });
}

main();
