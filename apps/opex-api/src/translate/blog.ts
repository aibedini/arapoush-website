import type { BlogBlock, BlogPostData } from "@arapoush/schema";

/** Blog posts as translation segments: every string of one translation keyed by where it lives. */
export type Tr = NonNullable<BlogPostData["translations"]["fa"]>;
/** Every translatable string of a translation as key → text (links, images and kinds stay out). */
export function toSegments(t: Tr) {
  const s: { key: string; text: string }[] = [];
  const add = (key: string, text: string | undefined) => text?.trim() && s.push({ key, text });
  add("title", t.title);
  add("excerpt", t.excerpt);
  add("seo.title", t.seo.title);
  add("seo.description", t.seo.description);
  add("seo.keyphrase", t.seo.keyphrase);
  (t.keywords ?? []).forEach((k, i) => add(`keywords.${i}`, k));
  t.keyTakeaways.forEach((k, i) => add(`takeaways.${i}`, k));
  t.faq.forEach((f, i) => (add(`faq.${i}.q`, f.q), add(`faq.${i}.a`, f.a)));
  for (const b of t.body) {
    const k = `body.${b.id}`;
    if (b.kind === "p" || b.kind === "h" || b.kind === "quote" || b.kind === "callout" || b.kind === "cta") add(`${k}.text`, b.text);
    if (b.kind === "quote") add(`${k}.cite`, b.cite);
    if (b.kind === "callout") add(`${k}.title`, b.title);
    if (b.kind === "cta") add(`${k}.button`, b.button);
    if (b.kind === "list") b.items.forEach((x, i) => add(`${k}.items.${i}`, x));
    if (b.kind === "image") (add(`${k}.alt`, b.image.alt), add(`${k}.caption`, b.caption));
    if (b.kind === "table") (b.head.forEach((x, i) => add(`${k}.head.${i}`, x)), b.rows.forEach((r, i) => r.forEach((x, j) => add(`${k}.rows.${i}.${j}`, x))), add(`${k}.caption`, b.caption));
  }
  return s;
}
export function fromSegments(t: Tr, m: Map<string, string>) {
  const g = (key: string, old: string) => m.get(key) ?? old;
  const body: BlogBlock[] = t.body.map((b) => {
    const k = `body.${b.id}`;
    switch (b.kind) {
      case "p":
      case "h":
        return { ...b, text: g(`${k}.text`, b.text) };
      case "quote":
        return { ...b, text: g(`${k}.text`, b.text), cite: b.cite ? g(`${k}.cite`, b.cite) : b.cite };
      case "callout":
        return { ...b, text: g(`${k}.text`, b.text), title: b.title ? g(`${k}.title`, b.title) : b.title };
      case "cta":
        return { ...b, text: g(`${k}.text`, b.text), button: g(`${k}.button`, b.button) };
      case "list":
        return { ...b, items: b.items.map((x, i) => g(`${k}.items.${i}`, x)) };
      case "image":
        return { ...b, image: { ...b.image, alt: b.image.alt ? g(`${k}.alt`, b.image.alt) : b.image.alt }, caption: b.caption ? g(`${k}.caption`, b.caption) : b.caption };
      case "table":
        return { ...b, head: b.head.map((x, i) => g(`${k}.head.${i}`, x)), rows: b.rows.map((r, i) => r.map((x, j) => g(`${k}.rows.${i}.${j}`, x))), caption: b.caption ? g(`${k}.caption`, b.caption) : b.caption };
    }
  });
  return {
    title: g("title", t.title),
    excerpt: g("excerpt", t.excerpt),
    body,
    keyTakeaways: t.keyTakeaways.map((x, i) => g(`takeaways.${i}`, x)),
    faq: t.faq.map((f, i) => ({ q: g(`faq.${i}.q`, f.q), a: g(`faq.${i}.a`, f.a) })),
    seo: { title: t.seo.title ? g("seo.title", t.seo.title) : undefined, description: t.seo.description ? g("seo.description", t.seo.description) : undefined, keyphrase: t.seo.keyphrase ? g("seo.keyphrase", t.seo.keyphrase) : undefined },
    keywords: (t.keywords ?? []).map((x, i) => g(`keywords.${i}`, x)),
  };
}
