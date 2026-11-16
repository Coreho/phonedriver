const FAR = 2;

/** A link to a place more than two screens away on the same page fades to it. Scrolling there took 1.5 s in Chrome and passed 13,700 px of the home page, and WebKit cut straight to it. The move itself is the browser's own (`location.hash`), so Back returns and focus follows, and Back is made a cut, since Chrome scrolled the whole way back; `history.pushState` would wake the router, which starts a page transition of its own. */
export function mountJump(root: HTMLElement): () => void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const page = document.documentElement;
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || reduce.matches || !document.startViewTransition) return;
    const to = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!to || Math.abs(to.getBoundingClientRect().top) < innerHeight * FAR) return;
    e.preventDefault();
    const move = document.startViewTransition(() => {
      page.style.scrollBehavior = "auto";
      if (location.hash === a.hash) to.scrollIntoView({ block: "start" });
      else location.hash = a.hash;
    });
    move.finished.finally(() => (page.style.scrollBehavior = ""));
  };
  const onBack = () => {
    page.style.scrollBehavior = "auto";
    requestAnimationFrame(() => requestAnimationFrame(() => (page.style.scrollBehavior = "")));
  };
  root.addEventListener("click", onClick);
  addEventListener("popstate", onBack);
  return () => {
    root.removeEventListener("click", onClick);
    removeEventListener("popstate", onBack);
  };
}
