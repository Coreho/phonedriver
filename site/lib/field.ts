import { onFrame } from "./frame";

const RAMP = [".", ":", "·", "1", "0", "8", "@"];

/** A still texture of glyphs on a canvas, the weave's material in two dimensions. `shade` gives the density (0 to 1) at a point in CSS pixels; denser places get heavier glyphs. */
export function glyphField(canvas: HTMLCanvasElement, shade: (x: number, y: number, w: number, h: number) => number, cell = 9, lit?: (x: number, y: number) => boolean) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  const style = getComputedStyle(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `700 ${cell}px ${style.fontFamily}`;
  const ink = style.color;
  const hot = style.getPropertyValue("--or").trim() || ink;
  ctx.textBaseline = "top";
  for (let y = 0; y < h; y += cell * 1.15) {
    for (let x = 0; x < w; x += cell * 0.82) {
      const s = shade(x, y, w, h);
      if (s < 0.06) continue;
      ctx.fillStyle = lit?.(x, y) ? hot : ink;
      ctx.globalAlpha = 0.12 + 0.6 * Math.min(1, s);
      ctx.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor(s * RAMP.length))], x, y);
    }
  }
}

/** A repeatable value from 0 to 1 for a pair of whole numbers. */
export const grain = (a: number, b: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const TURN = 9000;
const RATE = 70;
const DEPTH = 9;

/** A character drawn large in glyphs on `.faq-mark`, as a slab turning about its upright axis: the face is dense and its edge is lighter. It turns only while on screen, and stands still for a reader who asked for less motion. */
export function mountMark(el: HTMLElement): () => void {
  const canvas = el.querySelector<HTMLCanvasElement>(".faq-mark")!;
  const mask = document.createElement("canvas");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let off: (() => void) | null = null;
  let drawn = 0;
  const draw = (now: number) => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const turn = reduce ? 0.45 : (now / TURN) * Math.PI * 2;
    const face = Math.cos(turn);
    const side = Math.sin(turn);
    mask.width = w;
    mask.height = h;
    const ctx = mask.getContext("2d", { willReadFrequently: true })!;
    ctx.font = `800 ${h * 1.08}px ${getComputedStyle(canvas).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const layer = (k: number, tone: number) => {
      ctx.setTransform(Math.abs(face) < 0.04 ? 0.04 : face, 0, 0, 1, w / 2 + side * k * (w * 0.022), h * 0.54);
      ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
      ctx.fillText(canvas.dataset.mark!, 0, 0);
    };
    for (let k = -DEPTH; k < DEPTH; k++) layer(side * face > 0 ? -k : k, 95);
    layer(side * face > 0 ? -DEPTH : DEPTH, 255);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;
    glyphField(canvas, (x, y) => {
      const i = (Math.min(h - 1, Math.round(y + 5)) * w + Math.min(w - 1, Math.round(x + 3))) * 4;
      const a = (px[i] / 255) * (px[i + 3] / 255);
      return a < 0.1 ? 0 : a * (0.7 + 0.3 * grain(Math.round(x / 7), Math.round(y / 9)));
    });
  };
  const tick = (now: number) => {
    if (now - drawn < RATE) return;
    drawn = now;
    draw(now);
  };
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !off && !reduce) off = onFrame(tick);
    else if (!e.isIntersecting && off) {
      off();
      off = null;
    }
  });
  io.observe(canvas);
  const still = () => draw(performance.now());
  const ro = new ResizeObserver(still);
  ro.observe(canvas);
  document.fonts.ready.then(still);
  return () => {
    off?.();
    io.disconnect();
    ro.disconnect();
  };
}
