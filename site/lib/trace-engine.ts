import { glyphField, grain } from "./field";
import { onFrame } from "./frame";
import { touch } from "./lanes-engine";

const GO = 500;
const LEG = 520;
const HOLD = 260;
const SEEN = 1500;
const BACK = 700;

/** One recorded tap, traced: a dot leaves the agent's command, crosses the daemon and reaches the phone, the recording of that tap plays, and the reply comes back as a stream of glyphs. It plays when the stop lands and again from the button. */
export function mountTrace(el: HTMLElement): () => void {
  const at: [number, number] = JSON.parse(el.dataset.tap!);
  const tapped = Number(el.dataset.t);
  const chip = el.querySelector<HTMLElement>(".tr-chip")!;
  const stack = el.querySelector<HTMLElement>(".tr-stack")!;
  const shot = el.querySelector<HTMLElement>(".tr-shot")!;
  const video = shot.querySelector("video")!;
  const tap = shot.querySelector<HTMLElement>(".ln-tap")!;
  const dot = el.querySelector<HTMLElement>(".tr-dot")!;
  const stream = el.querySelector<HTMLCanvasElement>(".tr-stream")!;
  const play = el.querySelector<HTMLButtonElement>(".tr-play")!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t0 = 0;
  let off: (() => void) | null = null;
  let step = -1;

  const point = (node: HTMLElement, side: number): [number, number] => {
    const o = el.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return [r.left - o.left + r.width * side, r.top - o.top + r.height / 2];
  };
  const set = (n: number) => {
    if (n === step) return;
    step = n;
    el.dataset.step = String(n);
  };
  const rest = () => {
    video.pause();
    video.currentTime = (tapped + SEEN) / 1000;
    stream.style.setProperty("--p", "1");
    set(5);
  };
  const tick = (now: number) => {
    const t = now - t0;
    const legs: [HTMLElement, number, HTMLElement, number, number][] = [
      [chip, 1, stack, 0, GO],
      [stack, 1, shot, 0, GO + LEG + HOLD],
    ];
    const reach = GO + 2 * LEG + HOLD;
    let shown = false;
    for (const [from, a, to, b, start] of legs) {
      if (t < start || t >= start + LEG) continue;
      const k = (t - start) / LEG;
      const [x0, y0] = point(from, a);
      const [x1, y1] = point(to, b);
      dot.style.transform = `translate3d(${x0 + (x1 - x0) * k}px,${y0 + (y1 - y0) * k}px,0)`;
      shown = true;
    }
    dot.toggleAttribute("data-on", shown);
    if (t < GO) set(0);
    else if (t < GO + LEG) set(1);
    else if (t < GO + LEG + HOLD) set(2);
    else if (t < reach) set(3);
    else if (t < reach + SEEN) {
      if (step !== 4) {
        set(4);
        touch(tap, at[0], at[1]);
        video.play().catch(() => {});
      }
    } else {
      video.pause();
      const k = Math.min(1, (t - reach - SEEN) / BACK);
      stream.style.setProperty("--p", k.toFixed(3));
      if (k === 1) {
        set(5);
        off?.();
        off = null;
      }
    }
  };
  const run = () => {
    if (reduce) return rest();
    off?.();
    video.pause();
    video.currentTime = Math.max(0, tapped - 150) / 1000;
    stream.style.setProperty("--p", "0");
    step = -1;
    t0 = performance.now();
    off = onFrame(tick);
  };
  const draw = () =>
    glyphField(stream, (x, y, w, h) => {
      const d = Math.abs(y - h / 2 - Math.sin(x * 0.02) * h * 0.12) / (h * (0.22 + 0.1 * Math.sin(x * 0.011 + 2)));
      return d > 1 ? 0 : (1 - d * d) * (0.45 + 0.55 * grain(Math.round(x / 7), Math.round(y / 9)));
    });

  const ro = new ResizeObserver(draw);
  ro.observe(stream);
  play.addEventListener("click", run);
  el.addEventListener("life", run);
  play.hidden = false;
  rest();
  return () => {
    off?.();
    ro.disconnect();
    play.removeEventListener("click", run);
    el.removeEventListener("life", run);
  };
}
