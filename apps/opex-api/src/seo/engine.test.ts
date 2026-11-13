import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage, runSeo } from "./engine.ts";

const good = (loc: string) => `<!doctype html><html lang="${loc}" dir="${loc === "fa" ? "rtl" : "ltr"}"><head><title>Multi-layer tubes manufacturer | Arapoush</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="Arapoush makes multi-layer plastic tubes and effervescent tubes for cosmetics, pharma and food since 2005.">
<link rel="canonical" href="https://a.test/${loc}"><link rel="alternate" hreflang="fa" href="https://a.test/fa"><link rel="alternate" hreflang="en" href="https://a.test/en"><link rel="alternate" hreflang="tr" href="https://a.test/tr"><link rel="alternate" hreflang="x-default" href="https://a.test/fa">
<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="https://a.test/og.jpg"><meta property="og:url" content="https://a.test/${loc}"><meta property="og:site_name" content="A"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Arapoush"}]}</script></head>
<body><main><h1>Tubes</h1><h2>More</h2><p>${"word ".repeat(300)} 25 years</p><a href="/${loc}/contact">Contact</a><img src="/x.webp" alt="A tube"></main></body></html>`;
const H = (h: Record<string, string> = {}) => new Headers({ "strict-transport-security": "max-age=1", "x-content-type-options": "nosniff", "content-security-policy": "frame-ancestors 'self'", ...h });

test("a well-formed page has no issues (S5)", () => {
  assert.deepEqual(checkPage("https://a.test/en", good("en"), { status: 200, ms: 100, headers: H(), indexing: true, base: "https://a.test" }), []);
});

test("rules catch the problems the audits found (S5)", () => {
  const bad = good("en").replace("<title>Multi-layer tubes manufacturer | Arapoush</title>", "<title>" + "x".repeat(80) + "</title>").replace('href="/en/contact"', 'href="/contact"').replace('alt="A tube"', "").replace('"name":"Arapoush"', '"name":"آراپوش گستر تولید کننده تیوب های پلاستیکی چند لایه و تیوب قرص جوشان برای صنایع آرایشی و دارویی"');
  const rules = checkPage("https://a.test/en", bad, { status: 200, ms: 100, headers: H(), indexing: true, base: "https://a.test" }).map((i) => i.rule);
  for (const r of ["title-long", "link-locale", "img-alt-missing", "jsonld-language"]) assert.ok(rules.includes(r), r);
  assert.ok(checkPage("https://a.test/en", good("en").replace("<head>", '<head><meta name="robots" content="noindex">'), { status: 200, ms: 1, headers: H(), indexing: true, base: "" }).some((i) => i.rule === "noindex"));
});

test("a crawl reads robots, sitemap, llms.txt and the 404 probe (S5)", async () => {
  const site: Record<string, [number, string]> = {
    "/robots.txt": [200, "User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://a.test/sitemap.xml"],
    "/sitemap.xml": [200, "<urlset><url><loc>https://a.test/fa</loc><lastmod>2026-01-01</lastmod></url><url><loc>https://a.test/en</loc><lastmod>2026-01-01</lastmod></url></urlset>"],
    "/llms.txt": [200, "# Arapoush\n> tubes"],
    "/llms-full.txt": [200, "# Arapoush"],
    "/fa": [200, good("fa")],
    "/en": [200, good("en")],
  };
  const fake = (async (u: string | URL) => {
    const p = new URL(String(u)).pathname;
    const [s, b] = site[p] ?? [404, "<html><body>nope</body></html>"];
    return new Response(b, { status: s, headers: H() });
  }) as typeof fetch;
  const r = await runSeo({ base: "http://web:3000", publicBase: "https://a.test", indexing: true, extra: [], fetchImpl: fake });
  assert.equal(r.pages.length, 2);
  assert.ok(r.site.some((i) => i.rule === "ai-crawler-blocked"));
  assert.ok(r.site.some((i) => i.rule === "404-page"));
  assert.ok(r.score > 50 && r.score <= 100);
});
