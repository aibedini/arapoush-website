import { test } from "node:test";
import assert from "node:assert/strict";
import { blogChecks, checkScore, emptyPost, emptyTranslation, headings, isLive, parseInline, readingMinutes, safeHref, slugify, validSlug, wordCount, type BlogPostData } from "./blog.ts";

test("slugs keep Persian letters, turn ZWNJ and spaces into hyphens, reserve blog paths", () => {
  assert.equal(slugify("تیوب‌های چندلایه: راهنمای کامل!"), "تیوب-های-چندلایه-راهنمای-کامل");
  assert.equal(slugify("  Çok Katmanlı Tüp  "), "çok-katmanlı-tüp");
  assert.equal(slugify("كيف يعمل؟ ي"), "کیف-یعمل-ی", "Arabic kaf/yeh become Persian");
  assert.equal(validSlug("page"), false);
  assert.equal(validSlug("tube-guide"), true);
  assert.equal(validSlug("Bad Slug"), false);
});

test("inline markup is a safe subset: no javascript: or data: links", () => {
  const out = parseInline("a **b** *c* [d](/fa/x) [e](https://example.com) [f](javascript:alert(1)) [g](data:text/html,x)");
  assert.deepEqual(
    out.filter((x) => x.t !== "text").map((x) => x.t),
    ["b", "i", "a", "a"],
  );
  assert.ok(out.some((x) => x.t === "text" && x.v === "f"), "unsafe link text stays as text");
  assert.equal(safeHref("//evil.com"), null);
  assert.equal(safeHref("http://insecure.com"), null);
  assert.deepEqual(safeHref("/products/x"), { href: "/products/x", external: false });
});

test("headings get unique anchors; words and reading time are counted", () => {
  const body = [
    { id: "1", kind: "h" as const, level: 2 as const, text: "لایه‌ها" },
    { id: "2", kind: "h" as const, level: 2 as const, text: "لایه‌ها" },
    { id: "3", kind: "p" as const, text: "یک **دو** سه" },
  ];
  assert.deepEqual(headings(body).map((h) => h.anchor), ["لایه-ها", "لایه-ها-2"]);
  assert.equal(wordCount("نیم‌فاصله یک واژه است و dash-word هم"), 7, "ZWNJ and hyphen words count once");
  assert.equal(readingMinutes(body), 1);
});

test("a translation is live only when enabled with title, slug and body; checks score it", () => {
  const t = { ...emptyTranslation(), enabled: true, title: "عنوان", slug: "x", body: [{ id: "p", kind: "p" as const, text: "متن" }] };
  assert.equal(isLive(t), true);
  assert.equal(isLive({ ...t, enabled: false }), false);
  const weak: BlogPostData = { ...emptyPost(), translations: { fa: t } };
  const strong: BlogPostData = {
    ...weak,
    authorId: "a",
    cover: { src: "/media/x.webp" },
    products: ["tube"],
    translations: {
      fa: {
        ...t,
        title: "تیوب چندلایه چیست و چرا ماندگاری را بالا می‌برد",
        slug: "تیوب-چندلایه-چیست",
        excerpt: "تیوب چندلایه از چند لایهٔ پلیمری و یک لایهٔ مانع ساخته می‌شود که جلوی اکسیژن و نور را می‌گیرد و ماندگاری را بالا می‌برد.",
        body: [
          { id: "p", kind: "p", text: `تیوب چندلایه ${"واژه ".repeat(650)}` },
          { id: "h1", kind: "h", level: 2, text: "یک" },
          { id: "h2", kind: "h", level: 3, text: "دو" },
        ],
        keyTakeaways: ["۱", "۲", "۳"],
        faq: [{ q: "?", a: "!" }, { q: "?", a: "!" }],
        sources: [{ title: "s", url: "https://x.com" }],
        seo: { keyphrase: "تیوب چندلایه", description: "تیوب چندلایه چیست؟ ساختار لایه‌ها و دلیل اینکه ماندگاری کرم و دارو را تا دو برابر بیشتر می‌کند." },
      },
    },
  };
  assert.ok(checkScore(blogChecks(strong, "fa")) > checkScore(blogChecks(weak, "fa")) + 30);
  assert.equal(blogChecks(weak, "en")[0]!.key, "missing");
});
