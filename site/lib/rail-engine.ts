/** On a narrow screen the docs list is one row that scrolls sideways; this brings the current page's link into view. */
export function mountRail(el: HTMLElement): () => void {
  const nav = el.querySelector("nav")!;
  const here = nav.querySelector("[aria-current]");
  if (here) nav.scrollLeft += here.getBoundingClientRect().left - nav.getBoundingClientRect().left - 20;
  return () => {};
}
