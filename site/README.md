# phonedriver.dev

Next.js 16 (App Router), exported as static files.

```sh
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # writes site/out
pnpm check    # links, anchors, JSON-LD and page basics in site/out
pnpm brand    # favicon, design/logo, README banners, social images
node scripts/figures.mjs   # the home page's real captures (needs macOS `sips`)
```

- Pages are in `app/`. Docs, blog posts and comparisons are Markdown in `content/`, rendered by `lib/md.ts`. Their order lives in `lib/content.ts`.
- The home hero is `components/Hero.tsx`. The woven field and the alarm story are in `lib/hero-engine.ts`.
- The wordmark is drawn in `lib/brand.ts`. The header, footer and OG cards render from it; `pnpm brand` writes the static files (it needs Chrome and macOS `sips`).
- Below the hero, the home page is `app/page.tsx` with `app/home.css`: eight stops on one route (`DESIGN.md` has the plan, decision D44 the short form). Charts shared with `/benchmarks` are in `app/charts.css`. Sections are server-rendered in their final state. `lib/journey-engine.ts` draws each stop's line, types it by scroll and fires the stop's animation when it lands; `lib/weave.ts` draws the ribbons on one fixed canvas; `lib/frame.ts` is the one animation loop. Inner pages open with `components/PageTop.tsx`, one stop of the same route whose line types on load and lands on the page's figure. `components/Engines.tsx` mounts those and the smaller engines (copy buttons, dot fields, the read, the speed race, the typed prompt) from `lib/*-engine.ts`.
- On a phone the page is laid out for a thumb (decision D70): below 700 px the hero's player bar pins to the bottom of the window while the phone is in view; below 1000 px the dock names the current stop and opens the list of stops (`#stops`); below 900 px the read shows the tapped row's line under the screenshot and unfolds the tapped line's strip of screen. Hover styles sit inside `@media (hover:hover)` and their pressed twins inside `@media (hover:none)`. `lib/rail-engine.ts` scrolls the docs list to the current page.
- Changes of state are eased by three small engines mounted in `app/layout.tsx` and `app/page.tsx` (decision D71): `lib/fold-engine.ts` opens and closes every `<details>` by its height and holds the tapped row still, `lib/jump-engine.ts` fades to a same-page link more than two screens away, and `lib/tabs-engine.ts` eases the install box between panels of different heights. The two height animations run 300 and 280 ms. A button that says "Copied" keeps its width (`lib/copy-engine.ts`, plus a `min-width` on each Copy button).
- `public/assets/run-first.jpg` is the first frame of `run.mp4` (`ffmpeg -i run.mp4 -frames:v 1 -q:v 5 run-first.jpg`). It is the video's poster, so the phone is painted before the video arrives; make it again if the recording changes.
- `scripts/figures.mjs` writes `lib/screen.json` and the JPEGs in `public/assets/` from the repository's own captures: the Settings fixture and its snapshot in `crates/core`, the hidden-display captures in `docs/bench/data/`, and the demo poster.
- Benchmark numbers come from `../docs/bench/*.json` at build time. `/benchmarks/data/*` serves the raw files.
- `PHONEDRIVER_SITE_URL` sets the canonical domain (default `https://phonedriver.dev`).
