/**
 * S5: the SEO / GEO / AIO / SXO engine. It crawls the live site (sitemap + extra paths), reads each
 * page's HTML and runs the rules below, so the site is checked automatically without anyone asking an
 * AI. Rules come from the claude-seo audit checklist (technical, on-page, hreflang, schema, images,
 * GEO/AI readiness, SXO) and the Next.js SEO skill. No HTML parser dependency: the site's markup is
 * ours and predictable, so targeted regular expressions are enough (and bounded: pages over 3 MB are
 * not parsed).
 */
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Category = "technical" | "onpage" | "i18n" | "schema" | "images" | "links" | "geo" | "sxo" | "performance" | "security";
export type Issue = { rule: string; severity: Severity; category: Category; message: string; detail?: string };
export type PageReport = { url: string; status: number; ms: number; bytes: number; score: number; title: string | null; issues: Issue[] };
export type SiteReport = { base: string; score: number; categories: Record<Category, number>; site: Issue[]; pages: PageReport[]; counts: Record<Severity, number> };
type Fetch = typeof fetch;

export const LOCALES = ["fa", "en", "tr"] as const;
const PENALTY: Record<Severity, number> = { critical: 25, high: 10, medium: 4, low: 1, info: 0 };
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "CCBot"];
const MAX_HTML = 3 * 1024 * 1024;

// ── Tiny HTML helpers ──
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : null;
};
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
const meta = (html: string, key: string) => {
  for (const t of tags(html, "meta")) if ((attr(t, "name") ?? attr(t, "property"))?.toLowerCase() === key) return attr(t, "content");
  return null;
};
const text = (s: string) => decode(s.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const chars = (s: string) => [...s].length;

/** Runs every page rule on one HTML document. Pure (unit-tested). */
export function checkPage(url: string, html: string, o: { status: number; ms: number; headers: Headers; indexing: boolean; base: string }): Issue[] {
  const out: Issue[] = [];
  const add = (rule: string, severity: Severity, category: Category, message: string, detail?: string) => out.push({ rule, severity, category, message, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
  const u = new URL(url);
  const locale = (/^\/(fa|en|tr)(\/|$)/.exec(u.pathname)?.[1] ?? null) as (typeof LOCALES)[number] | null;

  if (o.status !== 200) {
    add("http-status", "critical", "technical", `Page answers ${o.status}`);
    return out;
  }
  // Technical / indexability
  const htmlTag = tags(html, "html")[0] ?? "";
  if (locale && attr(htmlTag, "lang")?.slice(0, 2) !== locale) add("html-lang", "high", "i18n", `<html lang> is "${attr(htmlTag, "lang") ?? ""}", URL locale is ${locale}`);
  if (locale === "fa" && attr(htmlTag, "dir") !== "rtl") add("html-dir", "medium", "i18n", "Persian page without dir=rtl");
  const robots = (meta(html, "robots") ?? "") + "," + (o.headers.get("x-robots-tag") ?? "");
  if (o.indexing && /noindex/i.test(robots)) add("noindex", "critical", "technical", "Indexable page says noindex", robots);
  const canonical = tags(html, "link").map((t) => (attr(t, "rel")?.toLowerCase() === "canonical" ? attr(t, "href") : null)).filter(Boolean) as string[];
  if (canonical.length !== 1) add("canonical-count", "high", "technical", `${canonical.length} canonical links (want 1)`);
  else if (!/^https?:\/\//.test(canonical[0]!)) add("canonical-absolute", "high", "technical", "Canonical is not absolute", canonical[0]);
  else if (new URL(canonical[0]!).pathname.replace(/\/$/, "") !== u.pathname.replace(/\/$/, "")) add("canonical-self", "medium", "technical", "Canonical points elsewhere", canonical[0]);

  // On-page
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const t = title ? decode(title).trim() : "";
  if (!t) add("title-missing", "critical", "onpage", "No <title>");
  else if (chars(t) > 60) add("title-long", "medium", "onpage", `Title is ${chars(t)} characters (≤ 60 shows in full)`, t);
  else if (chars(t) < 15) add("title-short", "medium", "onpage", `Title is only ${chars(t)} characters`, t);
  const desc = meta(html, "description") ?? "";
  if (!desc) add("description-missing", "high", "onpage", "No meta description");
  else if (chars(desc) > 160) add("description-long", "low", "onpage", `Description is ${chars(desc)} characters (≤ 160)`);
  else if (chars(desc) < 70) add("description-short", "low", "onpage", `Description is only ${chars(desc)} characters`);
  const h1s = html.match(/<h1\b[\s\S]*?<\/h1>/gi) ?? [];
  if (h1s.length === 0) add("h1-missing", "high", "onpage", "No <h1>");
  else if (h1s.length > 1) add("h1-multiple", "medium", "onpage", `${h1s.length} <h1> elements`);
  const headings = (html.match(/<h([1-6])\b/gi) ?? []).map((h) => Number(h.slice(2)));
  for (let i = 1; i < headings.length; i++)
    if (headings[i]! - headings[i - 1]! > 1) {
      add("heading-skip", "low", "onpage", `Heading level jumps from h${headings[i - 1]} to h${headings[i]}`);
      break;
    }

  // Hreflang
  const alts = tags(html, "link").filter((x) => attr(x, "rel")?.toLowerCase() === "alternate" && attr(x, "hreflang"));
  const langs = new Set(alts.map((x) => attr(x, "hreflang")!.toLowerCase()));
  if (locale) {
    for (const l of [...LOCALES, "x-default"]) if (![...langs].some((x) => x === l || x.startsWith(`${l}-`))) add("hreflang-missing", "high", "i18n", `No hreflang for ${l}`);
    if (alts.some((x) => !/^https?:\/\//.test(attr(x, "href") ?? ""))) add("hreflang-absolute", "high", "i18n", "hreflang URLs must be absolute");
  }

  // Social
  for (const k of ["og:title", "og:description", "og:image", "og:url"]) if (!meta(html, k)) add("og-missing", k === "og:image" ? "medium" : "low", "onpage", `No ${k}`);
  const ogImage = meta(html, "og:image");
  if (ogImage && !/^https?:\/\//.test(ogImage)) add("og-image-absolute", "medium", "onpage", "og:image is not absolute", ogImage);
  if (!meta(html, "og:site_name")) add("og-site-name", "low", "onpage", "No og:site_name");
  if (!meta(html, "twitter:card")) add("twitter-card", "low", "onpage", "No twitter:card");

  // Structured data
  const ld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  if (!ld.length) add("jsonld-missing", "high", "schema", "No JSON-LD structured data");
  const nodes: Record<string, unknown>[] = [];
  for (const raw of ld) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const graph = (Array.isArray(j["@graph"]) ? j["@graph"] : [j]) as Record<string, unknown>[];
      nodes.push(...graph);
    } catch {
      add("jsonld-invalid", "high", "schema", "A JSON-LD block does not parse");
    }
  }
  const typeOf = (n: Record<string, unknown>) => [n["@type"]].flat().map(String);
  for (const n of nodes) {
    const ty = typeOf(n);
    if (ty.includes("Organization") && !n.name && !String(n["@id"] ?? "").includes("#organization")) add("org-name", "medium", "schema", "Organization without a name");
    if (ty.includes("BreadcrumbList")) {
      const items = (n.itemListElement as { item?: string }[] | undefined) ?? [];
      if (items.some((i) => typeof i.item === "string" && i.item.includes("#"))) add("breadcrumb-fragment", "low", "schema", "Breadcrumb item URL has a #fragment");
    }
  }
  if (locale && locale !== "fa") {
    const ldText = ld.join(" ");
    const arabic = (ldText.match(/[؀-ۿ]/g) ?? []).length;
    if (arabic > 40 && arabic / Math.max(1, ldText.length) > 0.05) add("jsonld-language", "medium", "schema", `Structured data on a ${locale} page contains Persian text`);
  }

  // Images
  const imgs = tags(html, "img");
  const noAlt = imgs.filter((i) => attr(i, "alt") === null && attr(i, "aria-hidden") !== "true");
  if (noAlt.length) add("img-alt-missing", "high", "images", `${noAlt.length} images without an alt attribute`, noAlt.slice(0, 3).map((i) => attr(i, "src")).join(" "));
  const emptyAlt = imgs.filter((i) => attr(i, "alt") === "" && attr(i, "aria-hidden") !== "true" && !/logo|icon|bg|background|pattern/i.test(attr(i, "src") ?? ""));
  if (emptyAlt.length > 2) add("img-alt-empty", "low", "images", `${emptyAlt.length} content images with empty alt`, emptyAlt.slice(0, 3).map((i) => attr(i, "src")).join(" "));
  const noSizes = imgs.filter((i) => attr(i, "srcset") && !attr(i, "sizes"));
  if (noSizes.length) add("img-sizes", "low", "performance", `${noSizes.length} responsive images without sizes`);

  // Links
  const hrefs = tags(html, "a").map((a) => attr(a, "href")).filter((h): h is string => !!h);
  if (locale) {
    const leaks = hrefs.filter((h) => h.startsWith("/") && !h.startsWith("//") && !/^\/(fa|en|tr)(\/|$|#|\?)/.test(h) && !/^\/(media|images|files|api|llms|sitemap|robots)/.test(h));
    if (leaks.length) add("link-locale", "high", "links", `${leaks.length} internal links without a locale (they redirect to Persian)`, [...new Set(leaks)].slice(0, 5).join(" "));
  }
  const emptyLinks = tags(html, "a").filter((a) => !attr(a, "href") || attr(a, "href") === "#");
  if (emptyLinks.length > 3) add("link-empty", "low", "sxo", `${emptyLinks.length} links with no destination`);

  // Content, GEO and SXO
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  const words = text(main).split(" ").filter((w) => w.length > 1).length;
  if (words < 250) add("content-thin", "medium", "geo", `Only ${words} words of main content (AI answers and rankings favour substance)`);
  if (!/\d/.test(text(main))) add("geo-facts", "low", "geo", "No numbers or facts in the main content (citable facts help AI answers)");
  if (!nodes.some((n) => typeOf(n).some((x) => ["Organization", "Corporation", "LocalBusiness"].includes(x)))) add("geo-entity", "medium", "geo", "No Organization entity in structured data on this page");
  if (!/(tel:|mailto:|\/contact|#contact|quote|form)/i.test(html)) add("sxo-cta", "medium", "sxo", "No contact, quote or form call to action");
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add("viewport", "high", "sxo", "No viewport meta (mobile)");

  // Performance and security signals
  if (o.ms > 1800) add("ttfb", o.ms > 4000 ? "high" : "medium", "performance", `Server answered in ${o.ms} ms`);
  if (html.length > 600_000) add("html-size", "medium", "performance", `HTML is ${Math.round(html.length / 1024)} KB`);
  if (u.protocol === "https:" && !o.headers.get("strict-transport-security")) add("hsts", "medium", "security", "No Strict-Transport-Security header");
  if (!o.headers.get("x-content-type-options")) add("nosniff", "low", "security", "No X-Content-Type-Options");
  if (!/frame-ancestors/i.test(o.headers.get("content-security-policy") ?? "") && !o.headers.get("x-frame-options")) add("framing", "low", "security", "No clickjacking protection");
  return out;
}

export const pageScore = (issues: Issue[]) => Math.max(0, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));

async function get(f: Fetch, url: string, timeoutMs = 15_000) {
  const t0 = Date.now();
  const res = await f(url, { redirect: "manual", headers: { "user-agent": "OPEX-SEO-Engine/1.0 (+site self-check)", accept: "text/html,application/xml,text/plain" }, signal: AbortSignal.timeout(timeoutMs) });
  const len = Number(res.headers.get("content-length") ?? 0);
  const body = len > MAX_HTML ? "" : (await res.text()).slice(0, MAX_HTML);
  return { res, body, ms: Date.now() - t0 };
}

/** Crawls `base` and returns the report. `publicBase` is the canonical origin pages should name. */
export async function runSeo(o: { base: string; publicBase: string; indexing: boolean; extra: string[]; fetchImpl?: Fetch; maxPages?: number }): Promise<SiteReport> {
  const f = o.fetchImpl ?? fetch;
  const base = o.base.replace(/\/$/, "");
  const site: Issue[] = [];
  const add = (rule: string, severity: Severity, category: Category, message: string, detail?: string) => site.push({ rule, severity, category, message, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
  // The crawl may go through an internal address; URLs in the sitemap name the public origin.
  const local = (u: string) => {
    try {
      const x = new URL(u, base);
      return `${base}${x.pathname}${x.search}`;
    } catch {
      return null;
    }
  };

  // robots.txt
  let sitemapUrl = `${base}/sitemap.xml`;
  try {
    const { res, body } = await get(f, `${base}/robots.txt`);
    if (res.status !== 200) add("robots-missing", "high", "technical", `robots.txt answers ${res.status}`);
    else {
      const sm = /^sitemap:\s*(\S+)/im.exec(body)?.[1];
      if (!sm) add("robots-sitemap", "medium", "technical", "robots.txt does not name the sitemap");
      else sitemapUrl = local(sm) ?? sitemapUrl;
      // Group rules by user agent and look for a full block on AI crawlers (GEO).
      const groups = body.split(/\n(?=user-agent:)/i);
      for (const bot of AI_BOTS) {
        const g = groups.find((x) => new RegExp(`user-agent:\\s*${bot}\\b`, "i").test(x)) ?? groups.find((x) => /user-agent:\s*\*/i.test(x));
        if (g && /^disallow:\s*\/\s*$/im.test(g)) add("ai-crawler-blocked", "high", "geo", `${bot} is blocked from the whole site`);
      }
      if (!o.indexing) add("indexing-off", "info", "technical", "Indexing is switched off in Settings (staging)");
    }
  } catch (e) {
    add("robots-missing", "high", "technical", `robots.txt not reachable: ${(e as Error).message}`);
  }

  // sitemap.xml
  let urls: string[] = [];
  try {
    const { res, body } = await get(f, sitemapUrl);
    if (res.status !== 200) add("sitemap-missing", "critical", "technical", `Sitemap answers ${res.status}`);
    urls = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]!)).filter((u) => !/\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(u));
    if (res.status === 200 && !urls.length) add("sitemap-empty", "critical", "technical", "Sitemap lists no pages");
    const lastmods = [...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
    if (lastmods.length > 3 && new Set(lastmods).size === 1) add("sitemap-lastmod", "medium", "technical", "Every sitemap URL has the same lastmod (search engines learn to ignore it)");
    if (urls.some((u) => !u.startsWith(o.publicBase))) add("sitemap-origin", "high", "technical", `Sitemap URLs are not on ${o.publicBase}`, urls.find((u) => !u.startsWith(o.publicBase)));
  } catch (e) {
    add("sitemap-missing", "critical", "technical", `Sitemap not reachable: ${(e as Error).message}`);
  }

  // llms.txt (AIO / GEO)
  try {
    const { res, body } = await get(f, `${base}/llms.txt`);
    if (res.status !== 200) add("llms-missing", "medium", "geo", "No /llms.txt for AI assistants");
    else if (!/^#\s+\S/m.test(body)) add("llms-format", "low", "geo", "llms.txt has no # title");
    const full = await get(f, `${base}/llms-full.txt`);
    if (full.res.status !== 200) add("llms-full-missing", "low", "geo", "No /llms-full.txt");
  } catch {
    add("llms-missing", "medium", "geo", "llms.txt not reachable");
  }

  // 404 behaviour
  try {
    const { res, body } = await get(f, `${base}/fa/__opex_seo_probe__`);
    if (res.status !== 404) add("soft-404", "high", "technical", `Unknown URL answers ${res.status} (want 404)`);
    else if (!/<html[^>]+lang=/i.test(body) || !/<a\b[^>]+href=["']\/fa/i.test(body)) add("404-page", "medium", "sxo", "404 page is not localized or has no way back into the site");
  } catch {
    // network error already shows elsewhere
  }

  // Pages
  const paths = [...new Set([...urls.map(local).filter((x): x is string => !!x), ...o.extra.map((p) => `${base}${p}`)])].slice(0, o.maxPages ?? 150);
  if (!paths.length) for (const l of LOCALES) paths.push(`${base}/${l}`);
  const pages: PageReport[] = [];
  const titles = new Map<string, string[]>();
  const descs = new Map<string, string[]>();
  for (const url of paths) {
    try {
      const { res, body, ms } = await get(f, url);
      const issues = checkPage(url, body, { status: res.status, ms, headers: res.headers, indexing: o.indexing, base });
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim() ?? null;
      if (title) titles.set(title, [...(titles.get(title) ?? []), url]);
      const d = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(body)?.[1];
      if (d) descs.set(d, [...(descs.get(d) ?? []), url]);
      pages.push({ url: url.replace(base, o.publicBase), status: res.status, ms, bytes: body.length, score: 0, title, issues });
    } catch (e) {
      pages.push({ url: url.replace(base, o.publicBase), status: 0, ms: 0, bytes: 0, score: 0, title: null, issues: [{ rule: "unreachable", severity: "critical", category: "technical", message: (e as Error).message.slice(0, 200) }] });
    }
  }
  for (const [t, list] of titles) if (list.length > 1) for (const p of pages.filter((x) => list.includes(x.url.replace(o.publicBase, base)))) p.issues.push({ rule: "title-duplicate", severity: "medium", category: "onpage", message: `Same title as ${list.length - 1} other page(s)`, detail: t.slice(0, 120) });
  for (const [, list] of descs) if (list.length > 1) for (const p of pages.filter((x) => list.includes(x.url.replace(o.publicBase, base)))) p.issues.push({ rule: "description-duplicate", severity: "low", category: "onpage", message: `Same description as ${list.length - 1} other page(s)` });
  for (const p of pages) p.score = pageScore(p.issues);

  const all = [...site, ...pages.flatMap((p) => p.issues)];
  const cats: Category[] = ["technical", "onpage", "i18n", "schema", "images", "links", "geo", "sxo", "performance", "security"];
  const n = Math.max(1, pages.length);
  const categories = Object.fromEntries(cats.map((c) => [c, Math.max(0, Math.round(100 - all.filter((i) => i.category === c).reduce((s, i) => s + PENALTY[i.severity], 0) / Math.sqrt(n)))])) as Record<Category, number>;
  const pageAvg = pages.length ? pages.reduce((s, p) => s + p.score, 0) / pages.length : 0;
  const score = Math.max(0, Math.round(pageAvg - site.reduce((s, i) => s + PENALTY[i.severity], 0) / 2));
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>;
  for (const i of all) counts[i.severity]++;
  return { base: o.publicBase, score, categories, site, pages, counts };
}
