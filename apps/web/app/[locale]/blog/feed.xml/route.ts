import { isLocale, localeMeta, locales } from "@/lib/i18n";
import { pageUrl } from "@/lib/seo";
import { blogPath, getBlogPage, listPosts, tx } from "@/lib/blog";
import { abs } from "@/lib/blogSeo";
import { ensureContent } from "@/lib/content";

/** RSS 2.0 per language: the 30 newest articles. Static, refreshed with every publish (tag `opex`). */
export const dynamic = "force-static";
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  await ensureContent();
  const page = getBlogPage();
  const { items } = await listPosts(locale, { per: 30 });
  const self = pageUrl(locale, "/blog/feed.xml");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(tx(page.meta.title, locale))}</title>
<link>${pageUrl(locale, blogPath())}</link>
<description>${esc(tx(page.meta.description, locale))}</description>
<language>${localeMeta[locale].intl}</language>
<atom:link href="${self}" rel="self" type="application/rss+xml"/>
${items[0] ? `<lastBuildDate>${new Date(items[0].modifiedAt).toUTCString()}</lastBuildDate>` : ""}
${items
  .map(
    (p) => `<item>
<title>${esc(p.title)}</title>
<link>${pageUrl(locale, blogPath(p.slug))}</link>
<guid isPermaLink="false">${p.id}-${locale}</guid>
<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
${p.category ? `<category>${esc(p.category.name)}</category>` : ""}
${p.author ? `<author>noreply@arapoush.com (${esc(p.author.name)})</author>` : ""}
<description>${esc(p.excerpt)}</description>
${p.cover ? `<enclosure url="${esc(abs(p.cover.src))}" type="${p.cover.src.endsWith(".png") ? "image/png" : p.cover.src.endsWith(".jpg") || p.cover.src.endsWith(".jpeg") ? "image/jpeg" : "image/webp"}" length="0"/>` : ""}
</item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" } });
}
