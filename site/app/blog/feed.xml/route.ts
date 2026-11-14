import { esc } from "@/lib/md";
import { POSTS, page } from "@/lib/content";
import { url } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const items = POSTS.map((s) => {
    const p = page("blog", s);
    const date = new Date(`${p.meta.date}T00:00:00Z`).toUTCString();
    return `<item><title>${esc(p.meta.title)}</title><link>${url(p.path)}</link><guid>${url(p.path)}</guid><pubDate>${date}</pubDate><description>${esc(p.meta.description)}</description></item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>phonedriver blog</title><link>${url("/blog/")}</link><atom:link href="${url("/blog/feed.xml")}" rel="self" type="application/rss+xml"/><language>en</language><description>How phonedriver works and what I measured.</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
