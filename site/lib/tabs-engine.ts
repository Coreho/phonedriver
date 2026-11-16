const TIME = 280;
const EASE = "cubic-bezier(.23,1,.32,1)";

/** Tabs whose panels differ in height: the box eases to the new height. The install box went from 450 to 180 px in one frame at 390 px and pulled the page under it. */
export function mountTabs(el: HTMLElement): () => void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let last = el.offsetHeight;
  let moving: Animation | null = null;
  const ro = new ResizeObserver(() => {
    if (!moving) last = el.offsetHeight;
  });
  ro.observe(el);
  const onChange = () => {
    el.dataset.used = "";
    const from = moving ? el.getBoundingClientRect().height : last;
    moving?.cancel();
    moving = null;
    const to = el.offsetHeight;
    last = to;
    if (reduce.matches || Math.abs(to - from) < 2) return;
    el.style.overflow = "clip";
    const a = el.animate({ height: [`${from}px`, `${to}px`] }, { duration: TIME, easing: EASE });
    moving = a;
    a.onfinish = () => {
      if (moving !== a) return;
      moving = null;
      el.style.overflow = "";
    };
  };
  el.addEventListener("change", onChange);
  return () => {
    ro.disconnect();
    moving?.cancel();
    el.style.overflow = "";
    el.removeEventListener("change", onChange);
  };
}
