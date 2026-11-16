const REST = 1100;
const ZIP = 60;

/** The race. Slowed, each ball loops on its own trip time. At real speed all eight leave together, a ball back home lights its figure, and a trip too short to draw leaves a streak. */
export function mountRace(el: HTMLElement): () => void {
  const slow = Number(el.dataset.slow);
  const ctl = el.querySelector<HTMLElement>(".race-ctl")!;
  const play = el.querySelector<HTMLButtonElement>(".race-play")!;
  const speeds = [...el.querySelectorAll<HTMLButtonElement>("[data-speed]")];
  const balls = [...el.querySelectorAll<HTMLElement>("[data-ms]")].map((dot) => ({ dot, lane: dot.closest<HTMLElement>(".race-lane")!, ms: Number(dot.dataset.ms), run: 0, back: false }));
  const round = Math.max(...balls.map((b) => b.ms)) + REST;
  let raf = 0;
  let last = 0;
  let t = 0;
  let lap = 0;
  let real = false;
  let wanted = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;

  const clear = () => {
    for (const b of balls) {
      b.back = false;
      delete b.lane.dataset.back;
      delete b.lane.dataset.zip;
    }
  };
  const paint = () => {
    if (real && Math.floor(t / round) !== lap) {
      lap = Math.floor(t / round);
      clear();
    }
    for (const b of balls) {
      const p = real ? Math.min((t % round) / b.ms, 1) : (t % (b.ms * slow)) / (b.ms * slow);
      if (real && p === 1 && !b.back) {
        b.back = true;
        b.lane.dataset.back = "";
        if (b.ms < ZIP) b.lane.dataset.zip = "";
      }
      b.dot.style.transform = `translate3d(${(p < 0.5 ? p * 2 : 2 - p * 2) * b.run}px,0,0)`;
    }
  };
  const measure = () => {
    for (const b of balls) b.run = b.dot.parentElement!.clientWidth - b.dot.offsetWidth;
    paint();
  };
  const frame = (now: number) => {
    t += Math.min(now - last, 100);
    last = now;
    paint();
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    play.textContent = wanted ? "Pause" : "Play";
    if (wanted && seen && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (raf && !(wanted && seen)) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const toggle = () => {
    wanted = !wanted;
    sync();
  };
  const speed = (e: Event) => {
    const next = (e.currentTarget as HTMLElement).dataset.speed === "real";
    if (next === real) return;
    real = next;
    for (const s of speeds) s.setAttribute("aria-pressed", String((s.dataset.speed === "real") === real));
    t = 0;
    lap = 0;
    clear();
    wanted = true;
    paint();
    sync();
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
  for (const s of speeds) s.addEventListener("click", speed);
  sync();
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    play.removeEventListener("click", toggle);
    for (const s of speeds) s.removeEventListener("click", speed);
    clear();
    for (const b of balls) b.dot.style.transform = "";
  };
}
