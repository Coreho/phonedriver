import { onFrame } from "./frame";

const PLAY = 2600;
const REST = 1300;
const POP = 280;

type Lane = { el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ms: number; span: number; w: number; h: number; ink: string; lit: boolean };

/** The race, as a beat. Every lane of a call runs for as long as the slowest tool takes to finish it once, and stamps a dot each time its own call finishes: a faster tool draws a denser line. All calls share one sweep, so the slowest dot of each lands on the last beat. */
export function mountRace(el: HTMLElement): () => void {
  const ctl = el.querySelector<HTMLElement>(".race-ctl")!;
  const play = el.querySelector<HTMLButtonElement>(".race-play")!;
  const devs = [...el.querySelectorAll<HTMLButtonElement>("[data-dev]")];
  const panels = [...el.querySelectorAll<HTMLElement>("[data-for]")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const collect = (): Lane[] =>
    [...el.querySelectorAll<HTMLElement>("ol:not([hidden]) li")].flatMap((card) => {
      const tracks = [...card.querySelectorAll<HTMLCanvasElement>("canvas[data-ms]")];
      const span = Math.max(...tracks.map((c) => Number(c.dataset.ms)));
      return tracks.map((canvas) => ({ el: canvas.closest<HTMLElement>(".race-lane")!, canvas, ctx: canvas.getContext("2d")!, ms: Number(canvas.dataset.ms), span, w: 0, h: 0, ink: "", lit: false }));
    });
  let lanes = collect();
  let t = reduce ? PLAY : 0;
  let last = 0;
  let wanted = !reduce;
  let seen = false;
  let off: (() => void) | null = null;

  const paint = () => {
    const p = Math.min(t / PLAY, 1);
    for (const l of lanes) {
      const { ctx, w, h } = l;
      if (!w) continue;
      const r = Math.min(5, h / 4);
      const run = w - 2 * r;
      const now = p * l.span;
      const n = Math.floor(now / l.ms + 1e-6);
      const age = n ? ((now - n * l.ms) * PLAY) / l.span : POP;
      const pop = p < 1 && age < POP ? 1 - age / POP : 0;
      ctx.clearRect(0, 0, w, h);
      if (p < 1) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = l.ink;
        ctx.fillRect(r + p * run - 0.5, 0, 1, h);
      }
      ctx.fillStyle = l.ink;
      for (let i = 1; i <= n; i++) {
        const x = r + ((i * l.ms) / l.span) * run;
        const k = i === n ? pop : 0;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, h / 2, r * (1 + 0.7 * k), 0, 7);
        ctx.fill();
        if (k) {
          ctx.globalAlpha = k * 0.6;
          ctx.strokeStyle = l.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, h / 2, r * (1.4 + 1.6 * (1 - k)), 0, 7);
          ctx.stroke();
        }
      }
      if (l.lit !== n > 0) {
        l.lit = n > 0;
        l.el.toggleAttribute("data-back", l.lit);
      }
    }
  };
  const measure = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const l of lanes) {
      l.w = l.canvas.clientWidth;
      l.h = l.canvas.clientHeight;
      l.canvas.width = Math.round(l.w * dpr);
      l.canvas.height = Math.round(l.h * dpr);
      l.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      l.ink = getComputedStyle(l.canvas).color;
    }
    paint();
  };
  const tick = (now: number) => {
    t += Math.min(now - last, 100);
    last = now;
    if (t >= PLAY + REST) t = 0;
    paint();
  };
  const sync = () => {
    play.textContent = wanted ? "Pause" : "Play";
    const go = wanted && seen;
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
    if (wanted && t >= PLAY) t = 0;
    sync();
  };
  const device = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.dev;
    for (const l of lanes) l.el.removeAttribute("data-back");
    for (const d of devs) d.setAttribute("aria-pressed", String(d.dataset.dev === id));
    for (const p of panels) p.hidden = p.dataset.for !== id;
    lanes = collect();
    t = reduce ? PLAY : 0;
    wanted = !reduce;
    measure();
    sync();
    el.dispatchEvent(new CustomEvent("life"));
  };

  const ro = new ResizeObserver(measure);
  ro.observe(el);
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
  for (const d of devs) d.addEventListener("click", device);
  sync();
  return () => {
    off?.();
    ro.disconnect();
    io.disconnect();
    play.removeEventListener("click", toggle);
    for (const d of devs) d.removeEventListener("click", device);
    for (const l of lanes) l.el.removeAttribute("data-back");
  };
}
