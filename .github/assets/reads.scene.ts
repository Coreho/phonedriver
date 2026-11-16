const COLUMNS = 168;
const ROWS = 30;
const ITEMS = [4, 8, 12, 16, 20, 24];
const BARS = [11, 14, 8, 13, 12, 7];
const LINES = [46, 71, 52, 80, 63, 38];
const PHONE = { left: 10, right: 36, top: 1, bottom: 28 };
const REF = 62;
const TEXT = 70;
const SCAN_END = 0.7;
const FADE_FROM = 0.92;

function noise(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export default {
  columns: COLUMNS,
  rows: ROWS,
  charset: "standard",
  themes: {
    light: { ink: "#161512", paper: "#ffffff" },
    dark: { ink: "#f5f3ee", paper: "#141412" },
  },
  frames: 40,
  fps: 12,
  field: (u: number, v: number, ctx) => {
    const tone = shade(u, v, ctx.t);
    return ctx.theme === "light" ? Math.pow(tone, 0.4) : tone;
  },
};

function shade(u: number, v: number, t: number) {
    const col = Math.floor(u * COLUMNS);
    const row = Math.floor((1 - v) * ROWS);
    const fade = t > FADE_FROM ? 1 - (t - FADE_FROM) / (1 - FADE_FROM) : 1;
    const scan = PHONE.top + 1 + (Math.min(t, SCAN_END) / SCAN_END) * (PHONE.bottom - PHONE.top - 1);
    const inRows = row >= PHONE.top && row <= PHONE.bottom;
    const inCols = col >= PHONE.left && col <= PHONE.right;
    const edgeRow = row === PHONE.top || row === PHONE.bottom;
    const edgeCol = col <= PHONE.left + 1 || col >= PHONE.right - 1;
    if (inRows && inCols) {
      if (edgeRow && edgeCol) return 0;
      if (edgeRow || edgeCol) return 1;
      if (t < SCAN_END && row === Math.floor(scan)) return 0.72;
      const item = ITEMS.findIndex((top) => row === top || row === top + 1);
      if (item < 0) return 0;
      const icon = col >= PHONE.left + 4 && col <= PHONE.left + 6;
      const bar = col >= PHONE.left + 9 && col < PHONE.left + 9 + BARS[item] - (row === ITEMS[item] ? 0 : 4);
      if (!icon && !bar) return 0;
      return row < scan ? 0.3 + 0.65 * fade : 0.3;
    }
    const item = ITEMS.findIndex((top) => row === top || row === top + 1);
    if (item < 0 || ITEMS[item] + 1 >= scan) return 0;
    const since = (scan - ITEMS[item] - 1) / 3;
    const first = row === ITEMS[item];
    if (first && col > PHONE.right + 3 && col < REF - 3 && since < 1) {
      return (col - Math.floor(since * 24)) % 6 === 0 ? 0.5 : 0;
    }
    if (first && col >= REF && col < REF + 4) return fade;
    const length = Math.floor(Math.min(1, since) * (first ? LINES[item] : LINES[item] * 0.45));
    if (col >= TEXT && col < TEXT + length) {
      const word = noise(Math.floor((col + item * 7 + (first ? 0 : 3)) / 5), row);
      if ((col + item * 7 + (first ? 0 : 3)) % 5 === 0 && word < 0.75) return 0;
      return (first ? 0.45 + 0.5 * noise(col, row) : 0.25 + 0.2 * noise(col, row)) * fade;
    }
    return 0;
}
