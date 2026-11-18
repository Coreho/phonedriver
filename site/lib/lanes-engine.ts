import { onFrame } from "./frame";

const REST = 1800;
const IDLE = 1200;
const DRIFT = 250;
const TAP = 650;

type Step = { t0: number; t1: number; cmd: string; at: [number, number, number] | null };
type Lane = { el: HTMLElement; video: HTMLVideoElement; tap: HTMLElement; now: HTMLElement; steps: Step[]; said: string; tapped: number };

/** A dot where a finger landed: placed at `x`, `y` (0 to 1 of the screen) and its ring restarted. */
export function touch(dot: HTMLElement, x: number, y: number) {
  dot.style.left = `${x * 100}%`;
  dot.style.top = `${y * 100}%`;
  delete dot.dataset.go;
  void dot.offsetWidth;
  dot.dataset.go = "";
}

/** The lanes: one recording of several agents on one phone, each lane's video played on one clock. The cards are dealt from the phone's own screen when the stop lands, a dot marks each tap where it landed, and the slider scrubs every lane at once. */
export function mountLanes(el: HTMLElement): () => void {
  const length = Number(el.dataset.length);
  const ctl = el.querySelector<HTMLElement>(".race-ctl")!;
  const play = el.querySelector<HTMLButtonElement>(".race-play")!;
  const scrub = el.querySelector<HTMLInputElement>(".ln-scrub")!;
  const clock = el.querySelector<HTMLElement>(".ln-clock")!;
  const stage = el.querySelector<HTMLElement>(".ln-stage")!;
  const home = el.querySelector<HTMLElement>(".ln-s.yours")!;
  const lanes: Lane[] = [...el.querySelectorAll<HTMLElement>(".ln-s[data-lane]")].map((card) => ({
    el: card,
    video: card.querySelector("video")!,
    tap: card.querySelector<HTMLElement>(".ln-tap")!,
    now: card.querySelector<HTMLElement>(".ln-now")!,
    steps: JSON.parse(card.dataset.steps!),
    said: "",
    tapped: -1,
  }));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = reduce ? length : 0;
  let last = 0;
  let rest = 0;
  let held = 0;
  let wanted = !reduce;
  let seen = false;
  let off: (() => void) | null = null;

  const paint = (seek: boolean) => {
    for (const l of lanes) {
      const at = Math.min(t, length - 60) / 1000;
      if (seek || Math.abs(l.video.currentTime * 1000 - Math.min(t, length - 60)) > DRIFT) l.video.currentTime = at;
      let step: Step | null = null;
      for (const s of l.steps) if (s.t0 <= t) step = s;
      const busy = !!step && t < step.t1;
      const text = step ? step.cmd : "waiting";
      if (l.said !== text + busy) {
        l.said = text + busy;
        l.now.textContent = text;
        l.el.toggleAttribute("data-busy", busy);
      }
      let tapped = -1;
      l.steps.forEach((s, i) => {
        if (s.at && s.at[2] <= t && t < s.at[2] + TAP) tapped = i;
      });
      if (tapped !== l.tapped) {
        l.tapped = tapped;
        if (tapped >= 0) touch(l.tap, l.steps[tapped].at![0], l.steps[tapped].at![1]);
      }
    }
    clock.textContent = `${(Math.min(t, length) / 1000).toFixed(1)} s`;
    scrub.value = String(Math.round(Math.min(t, length)));
    scrub.style.setProperty("--p", `${(Math.min(t, length) / length) * 100}%`);
  };
  const run = (on: boolean) => {
    for (const l of lanes) {
      if (on && l.video.paused) l.video.play().catch(() => {});
      else if (!on && !l.video.paused) l.video.pause();
    }
  };
  const tick = (now: number) => {
    const dt = Math.min(now - last, 100);
    last = now;
    if (held) {
      if (now < held) return;
      held = 0;
    }
    if (t >= length) {
      run(false);
      rest += dt;
      if (rest < REST) return;
      rest = 0;
      t = 0;
      paint(true);
      return;
    }
    t = Math.min(t + dt, length);
    run(t < length);
    paint(false);
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
      run(false);
    }
  };
  const toggle = () => {
    wanted = !wanted;
    if (wanted && t >= length) t = 0;
    sync();
  };
  const seek = () => {
    t = Number(scrub.value);
    rest = 0;
    held = performance.now() + IDLE;
    run(false);
    paint(true);
  };
  const deal = () => {
    const o = home.getBoundingClientRect();
    for (const l of lanes) {
      const r = l.el.getBoundingClientRect();
      l.el.style.setProperty("--dx", `${o.left - r.left}px`);
      l.el.style.setProperty("--dy", `${o.top - r.top}px`);
    }
  };

  const ro = new ResizeObserver(deal);
  ro.observe(stage);
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
  deal();
  paint(true);
  return () => {
    off?.();
    run(false);
    ro.disconnect();
    io.disconnect();
    play.removeEventListener("click", toggle);
    scrub.removeEventListener("input", seek);
    el.removeEventListener("life", sync);
  };
}
