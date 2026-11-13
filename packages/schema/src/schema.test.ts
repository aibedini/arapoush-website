import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "./generated/seed.json" with { type: "json" };
import { CONTENT_TYPES, contentType } from "./index.ts";
import { validate, fieldAt, isLockedPath, isOperatorOnlyPath } from "./validate.ts";
import { getAt, setAt, parsePath, formatPath, matchPath } from "./paths.ts";
import { sanitizeText, sanitizeUrl } from "./sanitize.ts";
import { mergeLocales, pickLocale } from "./localize.ts";

test("every seed entry validates cleanly against its generated schema", () => {
  for (const t of CONTENT_TYPES) {
    const data = (seed as Record<string, unknown>)[t.key];
    assert.ok(data, `seed for ${t.key}`);
    const { issues } = validate(t.schema, data);
    assert.deepEqual(issues, [], `${t.key}: ${JSON.stringify(issues.slice(0, 3))}`);
  }
});

test("locale merge round-trips to the original per-locale trees", () => {
  const fa = { a: "سلام", list: [{ t: "یک" }, { t: "دو" }], n: 3 };
  const en = { a: "Hello", list: [{ t: "One" }, { t: "Two" }], n: 3 };
  const merged = mergeLocales({ fa, en });
  assert.deepEqual(pickLocale(merged, "fa"), fa);
  assert.deepEqual(pickLocale(merged, "en"), en);
  // Turkish falls back to English, then Persian.
  assert.deepEqual(pickLocale(merged, "tr"), en);
});

test("per-locale images pick their variant or the default", () => {
  const v = { bg: { default: { src: "/images/a.webp" }, fa: { src: "/images/fa/a.webp" } } };
  assert.equal(pickLocale<{ bg: { src: string } }>(v, "fa").bg.src, "/images/fa/a.webp");
  assert.equal(pickLocale<{ bg: { src: string } }>(v, "en").bg.src, "/images/a.webp");
});

test("field paths read and write by id, index and locale", () => {
  const doc = { tech: { items: [{ id: "flexo", summary: { fa: "الف", en: "a" } }, { id: "silk", tags: ["x", "y"] }] } };
  assert.equal(getAt(doc, "/tech/items[id=flexo]/summary@en"), "a");
  assert.equal(getAt(doc, "/tech/items[id=silk]/tags[1]"), "y");
  assert.equal(getAt(doc, "/tech/items[id=nope]/summary"), undefined);
  const next = setAt(doc, "/tech/items[id=flexo]/summary@fa", "ب");
  assert.equal(getAt(next, "/tech/items[id=flexo]/summary@fa"), "ب");
  assert.equal(getAt(doc, "/tech/items[id=flexo]/summary@fa"), "الف", "original untouched");
  assert.throws(() => setAt(doc, "/tech/missing/x", 1));
  assert.equal(formatPath(parsePath("/a/b[id=c]/d[2]@tr")), "/a/b[id=c]/d[2]@tr");
});

test("path globs: * one segment, ** many, locale filter", () => {
  assert.ok(matchPath("/tech/**", "/tech/items[id=flexo]/summary@fa"));
  assert.ok(matchPath("/tech/*/summary", "/tech/items[id=flexo]/summary"));
  assert.ok(!matchPath("/tech/*/summary", "/tech/items/x/summary"));
  assert.ok(matchPath("/**@fa", "/title@fa"));
  assert.ok(!matchPath("/**@fa", "/title@en"));
  assert.ok(matchPath("/**", "/anything/at/all"));
});

test("text hygiene: bidi overrides rejected, NFC, Persian letters normalised", () => {
  assert.throws(() => sanitizeText("abc‮def"));
  assert.equal(sanitizeText("كيك", { persian: true }), "کیک");
  assert.equal(sanitizeText("a\nb"), "a b");
  assert.equal(sanitizeText("a\r\nb", { multiline: true }), "a\nb");
  assert.equal(sanitizeText("é"), "é");
});

test("URLs: https, mailto, tel and site paths only", () => {
  assert.equal(sanitizeUrl("/fa/printing"), "/fa/printing");
  assert.equal(sanitizeUrl("#contact"), "#contact");
  assert.equal(sanitizeUrl("https://arapoush.com/x"), "https://arapoush.com/x");
  assert.throws(() => sanitizeUrl("javascript:alert(1)"));
  assert.throws(() => sanitizeUrl("http://x.com"));
  assert.throws(() => sanitizeUrl("//evil.com"));
  assert.throws(() => sanitizeUrl("https://x.com", { internal: true }));
});

test("validation is strict and reports exact paths", () => {
  const t = contentType("page.printing")!;
  const data = structuredClone((seed as Record<string, any>)["page.printing"]);
  data.hero.title.fa = "x‮y";
  data.hero.extra = "nope";
  const { issues } = validate(t.schema, data);
  assert.ok(issues.some((i) => i.path === "/hero/title@fa" && i.code === "TEXT_REJECTED"));
  assert.ok(issues.some((i) => i.path === "/hero/extra" && i.code === "UNKNOWN_FIELD"));
});

test("locks and operator-only flags come from overrides", () => {
  const eff = contentType("product.effervescent.page")!.schema;
  assert.ok(isLockedPath(eff, "/data/sizes[id=27x175]/d"));
  assert.ok(!isLockedPath(eff, "/sizes/title@fa"));
  const printing = contentType("page.printing")!.schema;
  assert.ok(isOperatorOnlyPath(printing, "/guide/questions[id=look]/options[id=detail]/effects"));
  assert.ok(isLockedPath(printing, "/tech/items[id=flexo]/id"));
  assert.ok(!isLockedPath(printing, "/tech/items[id=flexo]/summary@fa"));
  assert.equal(fieldAt(printing, "/tech/items[id=flexo]/summary@fa")?.kind, "text");
  const site = contentType("global.site")!.schema;
  assert.ok(isLockedPath(site, "/images/logo"));
});

test("field paths refuse prototype keys (S2: prototype pollution)", () => {
  for (const p of ["/__proto__@x", "/__proto__/toString", "/a/constructor/prototype", "/list[__proto__=1]", "/a@__proto__"]) assert.throws(() => parsePath(p), /Forbidden/);
  assert.throws(() => setAt({ a: {} }, "/__proto__@polluted", "yes"));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
