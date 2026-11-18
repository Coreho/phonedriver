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

/** A character drawn large in glyphs on `.faq-mark`. The glyphs are dealt again each time a question under `el` opens or closes. */
export function mountMark(el: HTMLElement): () => void {
  const canvas = el.querySelector<HTMLCanvasElement>(".faq-mark")!;
  const mask = document.createElement("canvas");
  let seed = 0;
  const draw = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    mask.width = w;
    mask.height = h;
    const ctx = mask.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, w, h);
    ctx.filter = "blur(5px)";
    ctx.font = `800 ${h * 1.12}px ${getComputedStyle(canvas).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(canvas.dataset.mark!, w / 2, h * 0.54);
    const alpha = ctx.getImageData(0, 0, w, h).data;
    glyphField(canvas, (x, y) => {
      const a = alpha[(Math.min(h - 1, Math.round(y + 5)) * w + Math.min(w - 1, Math.round(x + 3))) * 4 + 3] / 255;
      return a < 0.12 ? 0 : Math.min(1, a * 1.25) * (0.62 + 0.38 * grain(Math.round(x / 7) + seed * 13, Math.round(y / 9) + seed * 7));
    });
  };
  const deal = () => {
    seed++;
    draw();
  };
  const ro = new ResizeObserver(draw);
  ro.observe(canvas);
  el.addEventListener("toggle", deal, true);
  document.fonts.ready.then(draw);
  return () => {
    ro.disconnect();
    el.removeEventListener("toggle", deal, true);
  };
}
