import { onFrame } from "./frame";
import { touch } from "./lanes-engine";

const REST = [1500, 1700, 4200];
const DRIFT = 250;
const TAP = 650;
const SEEN = 900;
const WIRE = 280;
const FADE = 520;
const REWIND = 750;
const GATE = 0.38;
const DOTS = 8;

type Mark = { t: number; at: [number, number] | null };
type Pass = { length: number; steps: Mark[] };
type Wire = { pts: [number, number][]; len: number; born: number };

/** The saved run as a tape beside one phone, in three recordings. While an agent drives, each action travels from the phone to the tape and lands as a stop. On replay the tape rewinds and feeds the stops through the gate, and each one travels to the phone, with no model. After a change the tape jams at the stop whose screen differs. A stop jumps the recording to its step. */
export function mountReplay(el: HTMLElement): () => void {
  const passes: Pass[] = JSON.parse(el.dataset.passes!);
  const stops = Number(el.dataset.stops) - 1;
  const videos = [...el.querySelectorAll<HTMLVideoElement>("video")];
  const tabs = [...el.querySelectorAll<HTMLButtonElement>("[data-run]:not(video)")];
  const stage = el.querySelector<HTMLElement>(".rp-stage")!;
  const phone = el.querySelector<HTMLElement>(".rp-phone")!;
  const win = el.querySelector<HTMLElement>(".rp-win")!;
  const tape = el.querySelector<HTMLElement>(".rp-steps")!;
  const rows = [...tape.querySelectorAll<HTMLElement>("li")];
  const canvas = el.querySelector<HTMLCanvasElement>(".rp-wire")!;
  const ctx = canvas.getContext("2d")!;
  const mode = el.querySelector<HTMLElement>(".rp-mode")!;
  const say = el.querySelector<HTMLElement>(".rp-say")!;
  const says: string[] = JSON.parse(say.dataset.says!);
  const modes = tabs.map((b) => b.dataset.mode!);
  const dot = el.querySelector<HTMLElement>(".ln-tap")!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pass = reduce ? 2 : 0;
  let t = reduce ? passes[2].length : 0;
  let last = 0;
  let rest = 0;
  let held = 0;
  let tapped = -1;
  let sent = -1;
  let wire: Wire | null = null;
  let wanted = !reduce;
  let seen = false;
  let off: (() => void) | null = null;
  let key = "";
  let gap = 0;
  let gate = 0;
  let dpr = 1;

  const lead = () => (pass === 0 ? 0 : WIRE);
  const along = () => {
    const s = passes[pass].steps;
    const end = pass === 2 ? stops : s.length - 1;
    let i = 0;
    while (i < end && t >= s[i + 1].t) i++;
    if (i >= end) return end + (pass === 2 ? 0 : 0.35 * Math.min(1, (t - s[end].t) / (passes[pass].length - s[end].t)));
    const k = Math.min(1, Math.max(0, (t - s[i].t) / (s[i + 1].t - s[i].t)));
    return i + k * k * (3 - 2 * k);
  };
  const send = (i: number) => {
    const s = stage.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const x = parseFloat(getComputedStyle(win).getPropertyValue("--x"));
    const from: [number, number] = [w.left - s.left + x, w.top - s.top + gate];
    const at = passes[pass].steps[i].at;
    const to: [number, number] = at ? [p.left - s.left + at[0] * p.width, p.top - s.top + at[1] * p.height] : [p.right - s.left, Math.min(from[1], p.bottom - s.top - 8)];
    const mid = (p.right + w.left) / 2 - s.left;
    const pts: [number, number][] = at ? [from, [mid, from[1]], [mid, to[1]], to] : [from, [to[0], from[1]], to];
    if (pass === 0) pts.reverse();
    let len = 0;
    for (let j = 1; j < pts.length; j++) len += Math.abs(pts[j][0] - pts[j - 1][0]) + Math.abs(pts[j][1] - pts[j - 1][1]);
    wire = { pts, len, born: performance.now() };
  };
  const draw = (now: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!wire) return;
    const age = now - wire.born;
    if (age > WIRE + FADE) {
      wire = null;
      return;
    }
    const reach = Math.min(1, age / WIRE) * wire.len;
    ctx.fillStyle = getComputedStyle(canvas).color;
    ctx.globalAlpha = age < WIRE ? 1 : 1 - (age - WIRE) / FADE;
    let walked = 0;
    for (let j = 1; j < wire.pts.length; j++) {
      const [ax, ay] = wire.pts[j - 1];
      const [bx, by] = wire.pts[j];
      const seg = Math.abs(bx - ax) + Math.abs(by - ay);
      for (let d = Math.ceil(walked / DOTS) * DOTS; d < walked + seg && d <= reach; d += DOTS) {
        const k = (d - walked) / seg;
        const tip = reach - d < DOTS && age < WIRE;
        ctx.beginPath();
        ctx.arc((ax + (bx - ax) * k) * dpr, (ay + (by - ay) * k) * dpr, (tip ? 4 : 2) * dpr, 0, 7);
        ctx.fill();
      }
      walked += seg;
    }
  };
  const paint = (seek: boolean) => {
    const p = passes[pass];
    const video = videos[pass];
    const at = Math.min(t, p.length - 60);
    if (seek || Math.abs(video.currentTime * 1000 - at) > DRIFT) video.currentTime = at / 1000;
    const halted = pass === 2 && t >= p.steps[stops].t + SEEN;
    const done = t >= p.length;
    const state = rows.map((_, i) => {
      if (pass === 2 && i > stops) return "idle";
      if (pass === 2 && i === stops) return halted ? "stop" : t >= p.steps[i].t ? "run" : "idle";
      if (t < p.steps[i].t + (pass === 0 ? WIRE : 0)) return pass === 0 ? "wait" : "idle";
      const next = p.steps[i + 1]?.t ?? p.length;
      return t < next && !done ? "run" : pass === 0 ? "in" : "ok";
    });
    const line = halted ? says[2] : done && pass < 2 ? says[pass] : "";
    const now = `${pass}|${state.join()}|${line}`;
    if (now !== key) {
      key = now;
      rows.forEach((r, i) => (r.dataset.s = state[i]));
      el.dataset.pass = String(pass);
      el.toggleAttribute("data-halt", halted);
      say.textContent = line;
      mode.textContent = modes[pass];
      videos.forEach((v, i) => v.toggleAttribute("data-on", i === pass));
      tabs.forEach((b, i) => b.setAttribute("aria-pressed", String(i === pass)));
    }
    const u = along();
    tape.style.setProperty("--u", u.toFixed(3));
    tape.style.transform = `translate3d(0,${(gate - (u + 0.5) * gap).toFixed(1)}px,0)`;
    let hit = -1;
    let due = -1;
    p.steps.forEach((s, i) => {
      if (pass === 2 && i > stops) return;
      if (s.at && s.t <= t && t < s.t + TAP) hit = i;
      if (s.t - lead() <= t && t < s.t - lead() + WIRE) due = i;
    });
    if (hit !== tapped) {
      tapped = hit;
      if (hit >= 0) touch(dot, p.steps[hit].at![0], p.steps[hit].at![1]);
    }
    if (due !== sent) {
      sent = due;
      if (due >= 0 && !seek && !reduce) send(due);
    }
  };
  const run = (on: boolean) => {
    videos.forEach((v, i) => {
      if (on && i === pass && v.paused) v.play().catch(() => {});
      else if ((!on || i !== pass) && !v.paused) v.pause();
    });
  };
  const start = (next: number, at = 0) => {
    pass = next;
    t = at;
    rest = 0;
    tapped = -1;
    sent = -1;
    wire = null;
    if (!reduce) {
      tape.dataset.rewind = "";
      held = performance.now() + REWIND;
    }
    run(false);
    paint(true);
  };
  const tick = (now: number) => {
    const dt = Math.min(now - last, 100);
    last = now;
    draw(now);
    if (held) {
      if (now < held) return;
      held = 0;
      delete tape.dataset.rewind;
    }
    const p = passes[pass];
    if (t >= p.length) {
      run(false);
      rest += dt;
      if (rest >= REST[pass]) start((pass + 1) % passes.length);
      return;
    }
    t = Math.min(t + dt, p.length);
    run(t < p.length);
    paint(false);
  };
  const sync = () => {
    const go = wanted && seen && !("wait" in el.dataset);
    if (go && !off) {
      last = performance.now();
      off = onFrame(tick);
    } else if (!go && off) {
      off();
      off = null;
      run(false);
    }
  };
  const pick = (e: Event) => {
    const target = e.target as HTMLElement;
    const tab = target.closest<HTMLElement>("button[data-run]");
    const step = target.closest<HTMLElement>("button[data-step]");
    if (!tab && !step) return;
    if (tab) start(Number(tab.dataset.run));
    else start(pass, passes[pass].steps[Math.min(Number(step!.dataset.step), pass === 2 ? stops : rows.length - 1)].t);
    wanted = true;
    sync();
  };
  const measure = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(stage.clientWidth * dpr);
    canvas.height = Math.round(stage.clientHeight * dpr);
    gap = rows[0].offsetHeight;
    gate = win.clientHeight * GATE;
    wire = null;
    paint(false);
  };

  const ro = new ResizeObserver(measure);
  ro.observe(stage);
  const io = new IntersectionObserver(
    ([e]) => {
      seen = e.isIntersecting;
      sync();
    },
    { threshold: 0.15 },
  );
  io.observe(el);
  el.addEventListener("click", pick);
  el.addEventListener("life", sync);
  el.dataset.live = "";
  measure();
  paint(true);
  return () => {
    off?.();
    run(false);
    ro.disconnect();
    io.disconnect();
    el.removeEventListener("click", pick);
    el.removeEventListener("life", sync);
  };
}
