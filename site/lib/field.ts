const RAMP = [".", ":", "·", "1", "0", "8", "@"];

/** A still texture of glyphs on a canvas, the weave's material in two dimensions. `shade` gives the density (0 to 1) at a point in CSS pixels; denser places get heavier glyphs. */
export function glyphField(canvas: HTMLCanvasElement, shade: (x: number, y: number, w: number, h: number) => number, cell = 9) {
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
  ctx.fillStyle = style.color;
  ctx.textBaseline = "top";
  for (let y = 0; y < h; y += cell * 1.15) {
    for (let x = 0; x < w; x += cell * 0.82) {
      const s = shade(x, y, w, h);
      if (s < 0.06) continue;
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
