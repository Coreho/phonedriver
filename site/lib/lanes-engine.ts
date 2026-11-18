import { glyphField, grain } from "./field";
import { onFrame } from "./frame";

const REST = 1800;
const IDLE = 1200;
const DRIFT = 250;
const TAP = 650;

type Step = { t0: number; t1: number; cmd: string; at: [number, number, number] | null };
type Lane = { el: HTMLElement; shot: HTMLElement; path: SVGPathElement; video: HTMLVideoElement; tap: HTMLElement; now: HTMLElement; steps: Step[]; said: string; tapped: number };

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
  const port = home.querySelector<HTMLElement>(".ln-shot")!;
  const routes = el.querySelector<SVGSVGElement>(".ln-routes")!;
  const field = el.querySelector<HTMLCanvasElement>(".ln-field")!;
  const node = routes.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "circle"));
  node.setAttribute("r", "7");
  const lanes: Lane[] = [...el.querySelectorAll<HTMLElement>(".ln-s[data-lane]")].map((card) => ({
    el: card,
    shot: card.querySelector<HTMLElement>(".ln-shot")!,
    path: routes.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path")),
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
        l.path.toggleAttribute("data-busy", busy);
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
    play.toggleAttribute("data-on", wanted);
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
    const box = (card: HTMLElement, shot: HTMLElement) => {
      const left = card.offsetLeft + shot.offsetLeft;
      const top = card.offsetTop + shot.offsetTop;
      return { left, top, right: left + shot.offsetWidth, bottom: top + shot.offsetHeight, width: shot.offsetWidth, height: shot.offsetHeight };
    };
    const s = { left: 0, top: 0 };
    const p = box(home, port);
    const boxes = lanes.map((l) => box(l.el, l.shot));
    const nx = p.right - s.left;
    const ny = p.top - s.top + p.height * 0.62;
    const floor = Math.max(...boxes.map((b) => b.bottom)) - s.top + 26;
    lanes.forEach((l, i) => {
      l.el.style.setProperty("--dx", `${home.offsetLeft - l.el.offsetLeft}px`);
      l.el.style.setProperty("--dy", `${home.offsetTop - l.el.offsetTop}px`);
      const x = boxes[i].left - s.left + boxes[i].width / 2;
      const y = boxes[i].bottom - s.top + 6;
      const f = floor + i * 15;
      const bend = Math.min(36, (x - nx) / 3);
      l.path.setAttribute("d", `M${nx} ${ny}C${nx + 34 + i * 7} ${ny} ${nx + 14 + i * 7} ${f} ${nx + 70 + i * 7} ${f}L${x - bend} ${f}Q${x} ${f} ${x} ${f - bend}L${x} ${y}`);
    });
    node.setAttribute("cx", String(nx));
    node.setAttribute("cy", String(ny));
    if (!boxes.length || field.clientWidth === 0) return;
    const fx = { left: 0, top: 0 };
    const a = boxes[0];
    const b = boxes[boxes.length - 1];
    const x0 = a.left - fx.left - 40;
    const x1 = b.right - fx.left + 30;
    const y0 = a.top - fx.top + a.height * 0.72;
    const y1 = b.top - fx.top + b.height * 0.5;
    glyphField(field, (x, y) => {
      const k = (x - x0) / (x1 - x0);
      if (k < 0 || k > 1.04) return 0;
      const mid = y0 + (y1 - y0) * k + Math.sin(k * 7.3) * 16;
      const half = a.height * (0.62 + 0.2 * Math.sin(k * 4.1 + 1));
      const d = Math.abs(y - mid) / half;
      if (d > 1) return 0;
      const edge = Math.min(1, k * 5) * (1 - d * d);
      return edge * (0.35 + 0.65 * grain(Math.round(x / 7), Math.round(y / 9))) * (0.55 + 0.45 * Math.sin(y * 0.11 + k * 9));
    });
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
