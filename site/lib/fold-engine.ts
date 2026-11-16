const TIME = 300;
const EASE = "cubic-bezier(.23,1,.32,1)";

/** Opens and closes every `<details>` by its height, the same way in each browser: WebKit dropped a closing answer at once, and one list opening while another closes needs both to move together. Lists that share a `name` stay exclusive, but the name comes off at the first tap so the browser does not shut the other one in a single frame. The tapped row is held where it was tapped; before, it moved 103 px on the home FAQ at 390 px. */
export function mountFold(root: HTMLElement): () => void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const moving = new Map<HTMLDetailsElement, Animation>();
  let raf = 0;

  const fold = (d: HTMLDetailsElement, open: boolean) => {
    const from = d.getBoundingClientRect().height;
    moving.get(d)?.cancel();
    if (open) d.open = true;
    d.toggleAttribute("data-closing", !open);
    const to = open ? d.getBoundingClientRect().height : d.querySelector("summary")!.getBoundingClientRect().height + d.offsetHeight - d.clientHeight;
    d.style.overflow = "clip";
    const a = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: TIME, easing: EASE });
    moving.set(d, a);
    a.onfinish = () => {
      if (!open) d.open = false;
      d.removeAttribute("data-closing");
      d.style.overflow = "";
      moving.delete(d);
    };
  };

  const onClick = (e: MouseEvent) => {
    const summary = (e.target as HTMLElement).closest("summary");
    const d = summary?.parentElement;
    if (!summary || !(d instanceof HTMLDetailsElement) || reduce.matches) return;
    e.preventDefault();
    if (d.name) {
      for (const x of root.querySelectorAll<HTMLDetailsElement>(`details[name="${d.name}"]`)) {
        x.dataset.group = x.name;
        x.removeAttribute("name");
      }
    }
    const opening = !d.open || d.hasAttribute("data-closing");
    const top = summary.getBoundingClientRect().top;
    if (opening && d.dataset.group) {
      for (const x of root.querySelectorAll<HTMLDetailsElement>(`details[data-group="${d.dataset.group}"][open]:not([data-closing])`)) if (x !== d) fold(x, false);
    }
    fold(d, opening);
    const until = performance.now() + TIME + 60;
    cancelAnimationFrame(raf);
    const hold = () => {
      const moved = summary.getBoundingClientRect().top - top;
      if (Math.abs(moved) > 0.5) scrollBy({ top: moved, behavior: "instant" });
      if (performance.now() < until) raf = requestAnimationFrame(hold);
    };
    raf = requestAnimationFrame(hold);
  };
  root.addEventListener("click", onClick);
  return () => {
    cancelAnimationFrame(raf);
    moving.forEach((a) => a.finish());
    root.removeEventListener("click", onClick);
  };
}
