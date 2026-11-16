export function mountCopy(root: HTMLElement): () => void {
  const timers = new Map<HTMLElement, number>();
  const copy = (btn: HTMLElement, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      const label = btn.querySelector<HTMLElement>("[data-label]") ?? btn;
      btn.dataset.was ??= label.textContent ?? "";
      btn.style.minWidth = `${btn.offsetWidth}px`;
      label.textContent = "Copied";
      btn.dataset.done = "";
      navigator.vibrate?.(8);
      clearTimeout(timers.get(btn));
      timers.set(
        btn,
        window.setTimeout(() => {
          label.textContent = btn.dataset.was!;
          delete btn.dataset.done;
          btn.style.minWidth = "";
        }, 2500),
      );
    });
  const onClick = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-copy],[data-share]");
    if (!btn) return;
    const text = btn.dataset.share;
    if (text && navigator.share) navigator.share({ text }).catch(() => undefined);
    else copy(btn, text ?? btn.dataset.copy!);
  };
  // iOS Safari applies :active to a tapped element only when the page listens for touchstart.
  const press = () => {};
  root.addEventListener("click", onClick);
  root.addEventListener("touchstart", press, { passive: true });
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("touchstart", press);
    timers.forEach((t) => clearTimeout(t));
  };
}
