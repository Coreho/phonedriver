import { glyphField, grain } from "./field";
import { onFrame } from "./frame";
import { touch } from "./lanes-engine";
import { spline, type Pt } from "./weave";

const REST = [1500, 1700, 4600];
const DRIFT = 250;
const TAP = 650;
const SEEN = 900;
const K = 24;
const WAY: Pt[] = [
  [-0.04, 0.6],
  [0.06, 0.64],
  [0.28, 0.8],
  [0.5, 0.62],
  [0.72, 0.4],
  [0.94, 0.26],
];

type Mark = { t: number; at: [number, number] | null };
type Pass = { length: number; steps: Mark[] };

/** The saved run as a route beside one phone, in three recordings. While an agent drives, the route is laid behind a marker and each action becomes a numbered stop. On replay the marker drives the same route with no model. After a change it halts at the stop whose screen differs, and the saved screen comes up beside the one on the phone. A stop jumps the recording to its step. */
export function mountReplay(el: HTMLElement): () => void {
  const passes: Pass[] = JSON.parse(el.dataset.passes!);
  const stops = Number(el.dataset.stops) - 1;
  const videos = [...el.querySelectorAll<HTMLVideoElement>("video")];
  const tabs = [...el.querySelectorAll<HTMLButtonElement>("[data-run]:not(video)")];
  const way = el.querySelector<HTMLElement>(".rp-way")!;
  const rows = [...way.querySelectorAll<HTMLElement>("li")];
  const [base, done] = [...way.querySelectorAll<SVGPathElement>("path")];
  const clip = way.querySelector<SVGRectElement>("clipPath rect")!;
  const car = way.querySelector<HTMLElement>(".rp-car")!;
  const field = way.querySelector<HTMLCanvasElement>(".rp-field")!;
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
  let tapped = -1;
  let wanted = !reduce;
  let seen = false;
  let off: (() => void) | null = null;
  let key = "";
  let line: Pt[] = [];

  const along = () => {
    const s = passes[pass].steps;
    const end = pass === 2 ? stops : s.length - 1;
    let i = 0;
    while (i < end && t >= s[i + 1].t) i++;
    if (i >= end) return end;
    const k = Math.min(1, Math.max(0, (t - s[i].t) / (s[i + 1].t - s[i].t)));
    return i + k * k * (3 - 2 * k);
  };
  const paint = (seek: boolean) => {
    const p = passes[pass];
    const video = videos[pass];
    const at = Math.min(t, p.length - 60);
    if (seek || Math.abs(video.currentTime * 1000 - at) > DRIFT) video.currentTime = at / 1000;
    const halted = pass === 2 && t >= p.steps[stops].t + SEEN;
    const over = t >= p.length;
    const state = rows.map((_, i) => {
      if (pass === 2 && i > stops) return halted ? "skip" : "idle";
      if (pass === 2 && i === stops) return halted ? "stop" : t >= p.steps[i].t ? "run" : "idle";
      if (t < p.steps[i].t) return pass === 0 ? "wait" : "idle";
      const next = p.steps[i + 1]?.t ?? p.length;
      return t < next && !over ? "run" : "ok";
    });
    const text = halted ? says[2] : over && pass < 2 ? says[pass] : "";
    const now = `${pass}|${state.join()}|${text}`;
    if (now !== key) {
      key = now;
      rows.forEach((r, i) => (r.dataset.s = state[i]));
      el.dataset.pass = String(pass);
      el.toggleAttribute("data-halt", halted);
      say.textContent = text;
      mode.textContent = modes[pass];
      videos.forEach((v, i) => v.toggleAttribute("data-on", i === pass));
      tabs.forEach((b, i) => b.setAttribute("aria-pressed", String(i === pass)));
    }
    if (line.length) {
      const f = (along() + 1) * K;
      const i = Math.min(line.length - 2, Math.floor(f));
      const k = f - i;
      const x = line[i][0] + (line[i + 1][0] - line[i][0]) * k;
      const y = line[i][1] + (line[i + 1][1] - line[i][1]) * k;
      car.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      clip.setAttribute("width", String(Math.max(0, x + 40)));
    }
    let hit = -1;
    p.steps.forEach((s, i) => {
      if (s.at && s.t <= t && t < s.t + TAP && !(pass === 2 && i > stops)) hit = i;
    });
    if (hit !== tapped) {
      tapped = hit;
      if (hit >= 0) touch(dot, p.steps[hit].at![0], p.steps[hit].at![1]);
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
    run(false);
    paint(true);
  };
  const tick = (now: number) => {
    const dt = Math.min(now - last, 100);
    last = now;
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
    const w = way.clientWidth;
    const h = way.clientHeight;
    if (!w || !h) return;
    line = spline(WAY.map(([x, y]) => [x * w, y * h] as Pt), K);
    const d = `M${line.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}`;
    base.setAttribute("d", d);
    done.setAttribute("d", d);
    clip.setAttribute("height", String(h));
    rows.forEach((r, i) => {
      r.style.left = `${WAY[i + 1][0] * w}px`;
      r.style.top = `${WAY[i + 1][1] * h}px`;
    });
    glyphField(
      field,
      (x, y) => {
        const i = Math.min(line.length - 1, Math.max(0, Math.round(((x / w + 0.04) / 0.98) * (line.length - 1))));
        const depth = (y - line[i][1] - 22) / (h * 0.5);
        if (depth < 0 || depth > 1) return 0;
        return (1 - depth) * 0.42 * (0.4 + 0.6 * grain(Math.round(x / 7), Math.round(y / 10)));
      },
      10,
    );
    paint(false);
  };

  const ro = new ResizeObserver(measure);
  ro.observe(way);
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
