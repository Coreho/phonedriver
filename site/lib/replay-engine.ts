import { onFrame } from "./frame";
import { touch } from "./lanes-engine";

const REST = [1500, 1700, 4200];
const DRIFT = 250;
const TAP = 650;
const SEEN = 900;

type Mark = { t: number; at: [number, number] | null };
type Pass = { length: number; steps: Mark[] };

/** The saved run, in three recordings of one phone: an agent does it and each action lands in the file, the file replays it with no model, and a replay after a change stops at the step whose screen differs. A row jumps the recording to its step. */
export function mountReplay(el: HTMLElement): () => void {
  const passes: Pass[] = JSON.parse(el.dataset.passes!);
  const stops = Number(el.dataset.stops) - 1;
  const videos = [...el.querySelectorAll<HTMLVideoElement>("video")];
  const tabs = [...el.querySelectorAll<HTMLButtonElement>("[data-run]:not(video)")];
  const rows = [...el.querySelectorAll<HTMLElement>(".rp-steps li")];
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
      if (t < p.steps[i].t) return pass === 0 ? "wait" : "idle";
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
  paint(true);
  return () => {
    off?.();
    run(false);
    io.disconnect();
    el.removeEventListener("click", pick);
    el.removeEventListener("life", sync);
  };
}
