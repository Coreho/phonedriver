import { onFrame } from "./frame";

const REST = 2600;
const IDLE = 1400;

type Seg = { el: HTMLElement; t0: number; t1: number; cmd: string; reply: string };
type Lane = { frames: { el: HTMLElement; t: number }[]; frame: number; segs: Seg[]; now: HTMLElement | null; said: string; ball: HTMLElement; track: HTMLElement; run: number; host: HTMLElement };

/** The lanes: one recording of several sessions on one phone, played on one clock. Each lane's ball rides its track, its calls fill as they run, and its screen shows the frame the phone had at that moment. The slider under the tracks scrubs all of them at once. */
export function mountLanes(el: HTMLElement): () => void {
  const wall = Number(el.dataset.wall);
  const rate = Number(el.dataset.rate ?? 1);
  const ctl = el.querySelector<HTMLElement>(".race-ctl")!;
  const play = el.querySelector<HTMLButtonElement>(".race-play")!;
  const scrub = el.querySelector<HTMLInputElement>(".ln-scrub")!;
  const head = el.querySelector<HTMLElement>(".ln-head")!;
  const clock = el.querySelector<HTMLElement>(".ln-clock")!;
  const score = el.querySelector<HTMLElement>(".ln-score")!;
  const lanes: Lane[] = [...el.querySelectorAll<HTMLElement>(".ln-row")].map((row) => {
    const host = el.querySelector<HTMLElement>(`.ln-s[data-lane="${row.dataset.lane}"]`)!;
    return {
      host,
      frames: [...host.querySelectorAll<HTMLElement>("[data-t]")].map((f) => ({ el: f, t: Number(f.dataset.t) })),
      frame: -1,
      segs: [...row.querySelectorAll<HTMLElement>("b")].map((b) => ({ el: b, t0: Number(b.dataset.t0), t1: Number(b.dataset.t1), cmd: b.dataset.cmd!, reply: b.dataset.reply! })),
      now: row.querySelector<HTMLElement>(".ln-now"),
      said: "",
      ball: row.querySelector<HTMLElement>(".ln-track i")!,
      track: row.querySelector<HTMLElement>(".ln-track")!,
      run: 0,
    };
  });
  for (const l of lanes) for (const f of l.frames) f.el.removeAttribute("data-on");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = reduce ? wall : 0;
  let last = 0;
  let rest = 0;
  let wanted = !reduce;
  let seen = false;
  let held = 0;
  let off: (() => void) | null = null;

  const say = (l: Lane, text: string, state: string) => {
    if (!l.now || l.said === state + text) return;
    l.said = state + text;
    l.now.textContent = text;
    l.now.dataset.s = state;
  };
  const paint = () => {
    const k = Math.min(t / wall, 1);
    for (const l of lanes) {
      let f = -1;
      for (let i = 0; i < l.frames.length; i++) if (l.frames[i].t <= t) f = i;
      if (f !== l.frame) {
        l.frames[l.frame]?.el.removeAttribute("data-on");
        l.frames[(l.frame = f)]?.el.setAttribute("data-on", "");
      }
      let busy = false;
      let done: Seg | null = null;
      for (const s of l.segs) {
        const p = Math.min(Math.max((t - s.t0) / (s.t1 - s.t0), 0), 1);
        s.el.style.setProperty("--p", String(p));
        if (p > 0 && p < 1) {
          busy = true;
          say(l, s.cmd, "run");
        } else if (p === 1) done = s;
      }
      l.host.toggleAttribute("data-busy", busy);
      if (!busy && l.segs.length) say(l, done ? done.reply : "", done ? "done" : "wait");
      l.ball.style.transform = `translate3d(${k * l.run}px,0,0)`;
      l.ball.toggleAttribute("data-busy", busy);
    }
    head.style.transform = `translate3d(${k * (lanes[0]?.run ?? 0)}px,0,0)`;
    clock.textContent = `${(Math.min(t, wall) / 1000).toFixed(1)} s`;
    scrub.value = String(Math.round(Math.min(t, wall)));
    scrub.style.setProperty("--p", `${k * 100}%`);
  };
  const measure = () => {
    for (const l of lanes) l.run = l.track.clientWidth;
    paint();
  };
  const tick = (now: number) => {
    const dt = Math.min(now - last, 100);
    last = now;
    if (held && now < held) return;
    held = 0;
    if (t >= wall) {
      rest += dt;
      if (rest < REST) return;
      rest = 0;
      t = 0;
    } else t = Math.min(t + dt * rate, wall);
    paint();
  };
  const sync = () => {
    play.textContent = wanted ? "Pause" : "Play";
    const go = wanted && seen && !("wait" in el.dataset);
    if (go && !off) {
      last = performance.now();
      off = onFrame(tick);
    } else if (!go && off) {
      off();
      off = null;
    }
  };
  const toggle = () => {
    wanted = !wanted;
    if (wanted && t >= wall) t = 0;
    sync();
  };
  const seek = () => {
    t = Number(scrub.value);
    rest = 0;
    held = performance.now() + IDLE;
    paint();
  };

  const ro = new ResizeObserver(measure);
  ro.observe(score);
  const io = new IntersectionObserver(
    ([e]) => {
      seen = e.isIntersecting;
      sync();
    },
    { threshold: 0.15 },
  );
  io.observe(el);
  ctl.hidden = false;
  play.addEventListener("click", toggle);
  scrub.addEventListener("input", seek);
  el.addEventListener("life", sync);
  measure();
  return () => {
    off?.();
    ro.disconnect();
    io.disconnect();
    play.removeEventListener("click", toggle);
    scrub.removeEventListener("input", seek);
    el.removeEventListener("life", sync);
  };
}
