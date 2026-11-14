/**
 * Blog (docs/opex/BLOG-PLAN.md): the post shape and the pure helpers the API, the console and the
 * website share — slugs, the safe inline-markup subset, headings/TOC, reading time and the SEO/GEO
 * checklist. No raw HTML exists anywhere in a post.
 */
import { LOCALES, type ImageValue, type Locale } from "./fields.ts";

export type BlogImage = ImageValue & { alt?: string };

export type BlogBlock =
  | { id: string; kind: "p"; text: string }
  | { id: string; kind: "h"; level: 2 | 3; text: string }
  | { id: string; kind: "list"; ordered: boolean; items: string[] }
  | { id: string; kind: "image"; image: BlogImage; caption?: string }
  | { id: string; kind: "quote"; text: string; cite?: string }
  | { id: string; kind: "callout"; tone: "info" | "tip" | "warn"; title?: string; text: string }
  | { id: string; kind: "table"; head: string[]; rows: string[][]; caption?: string }
  | { id: string; kind: "cta"; text: string; button: string; href: string };
export type BlogBlockKind = BlogBlock["kind"];
export const BLOG_BLOCK_KINDS: BlogBlockKind[] = ["p", "h", "list", "image", "quote", "callout", "table", "cta"];

export type BlogFaq = { q: string; a: string };
export type BlogSource = { title: string; url: string };
export type BlogSeo = { title?: string; description?: string; keyphrase?: string; canonical?: string; noindex?: boolean; ogImage?: BlogImage | null };

export type BlogTranslation = {
  enabled: boolean;
  title: string;
  slug: string;
  excerpt: string;
  body: BlogBlock[];
  keyTakeaways: string[];
  faq: BlogFaq[];
  sources: BlogSource[];
  seo: BlogSeo;
  /** Secondary keywords (the focus keyphrase is seo.keyphrase): JSON-LD keywords, article:tag, checks. */
  keywords?: string[];
};

/** Pages a post can point readers to at its end. */
export const BLOG_PRODUCTS = ["tube", "effervescent", "printing", "applications"] as const;
export type BlogProduct = (typeof BLOG_PRODUCTS)[number];

export type BlogPostData = {
  categoryId: string | null;
  tagIds: string[];
  authorId: string | null;
  reviewerId: string | null;
  cover: BlogImage | null;
  featured: boolean;
  products: BlogProduct[];
  relatedIds: string[];
  /** Comments on this post (when comments are on for the blog). Missing = open. */
  commentsOpen?: boolean;
  /** Email confirmed subscribers when this post is first published. */
  notifySubscribers?: boolean;
  translations: Partial<Record<Locale, BlogTranslation>>;
};

/** Parts of the blog an editor can switch off as a whole (OPEX blog settings). */
export const BLOG_SECTIONS = ["comments", "newsletter", "search", "related", "share", "toc", "takeaways", "faq", "sources", "authorBox", "readingTime", "products", "rss", "homeFeed"] as const;
export type BlogSection = (typeof BLOG_SECTIONS)[number];
export type BlogSettings = {
  enabled: boolean;
  perPage: number;
  sections: Record<BlogSection, boolean>;
  comments: { moderation: "all" | "known" | "none"; closeAfterDays: number; maxLinks: number; requireEmail: boolean };
};
export const DEFAULT_BLOG_SETTINGS: BlogSettings = {
  enabled: true,
  perPage: 12,
  sections: Object.fromEntries(BLOG_SECTIONS.map((k) => [k, true])) as Record<BlogSection, boolean>,
  comments: { moderation: "all", closeAfterDays: 0, maxLinks: 2, requireEmail: true },
};
/** Whether comments are open on a post: blog switch, post switch and the auto-close age. */
export function commentsOpen(s: BlogSettings, d: Pick<BlogPostData, "commentsOpen">, firstPublishedAt: string | Date | null, now = Date.now()) {
  if (!s.enabled || !s.sections.comments || d.commentsOpen === false) return false;
  if (s.comments.closeAfterDays > 0 && firstPublishedAt && now - new Date(firstPublishedAt).getTime() > s.comments.closeAfterDays * 86_400_000) return false;
  return true;
}

export const emptyTranslation = (): BlogTranslation => ({ enabled: false, title: "", slug: "", excerpt: "", body: [], keyTakeaways: [], faq: [], sources: [], seo: {}, keywords: [] });
export const emptyPost = (): BlogPostData => ({ categoryId: null, tagIds: [], authorId: null, reviewerId: null, cover: null, featured: false, products: [], relatedIds: [], translations: { fa: { ...emptyTranslation(), enabled: true } } });

/** A translation the website shows: switched on and complete enough to be a page. */
export const isLive = (t: BlogTranslation | undefined): t is BlogTranslation => !!t && t.enabled && !!t.title.trim() && !!t.slug && t.body.length > 0;
export const liveLocales = (d: BlogPostData): Locale[] => LOCALES.filter((l) => isLive(d.translations[l]));

/**
 * URL slug. Persian and Turkish letters are kept (they are valid in URLs and read better in search
 * results); spaces, ZWNJ and punctuation become hyphens.
 */
export function slugify(input: string) {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‍\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .replace(/-$/, "");
}
export const SLUG_RE = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
/** Blog paths of their own (/blog/page/2, /blog/category/…): a post cannot use these as its slug. */
export const RESERVED_SLUGS = ["page", "category", "author", "preview", "feed", "search", "newsletter"];
export const validSlug = (s: string) => SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s);

// ── Inline markup: **bold**, *italic*, [text](url). Everything else is plain text. ──
export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "i"; v: string } | { t: "a"; v: string; href: string; external: boolean };

/** Only site paths, https links and mailto/tel are kept; anything else (javascript:, data:) becomes text. */
export function safeHref(href: string): { href: string; external: boolean } | null {
  const h = href.trim();
  if (/^\/(?!\/)[^\s]*$/.test(h)) return { href: h, external: false };
  if (/^#[\w؀-ۿ-]+$/.test(h)) return { href: h, external: false };
  if (/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(h)) return { href: h, external: true };
  if (/^(mailto|tel):[^\s]+$/i.test(h)) return { href: h, external: true };
  return null;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "i", v: m[2] });
    else {
      const link = safeHref(m[4]!);
      out.push(link ? { t: "a", v: m[3]!, ...link } : { t: "text", v: m[3]! });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}
export const stripInline = (text: string) => parseInline(text).map((x) => x.v).join("");

/** All readable text of a body (for word counts, summaries and search). */
export function bodyText(body: BlogBlock[]) {
  return body
    .map((b) => {
      switch (b.kind) {
        case "p":
        case "h":
        case "quote":
          return stripInline(b.text);
        case "callout":
          return [b.title ?? "", stripInline(b.text)].join(" ");
        case "list":
          return b.items.map(stripInline).join(" ");
        case "table":
          return [...b.head, ...b.rows.flat()].join(" ");
        case "image":
          return b.caption ?? "";
        case "cta":
          return b.text;
      }
    })
    .join("\n");
}
export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}]+(?:[‌'’-][\p{L}\p{N}]+)*/gu) ?? []).length;
/** ~200 words a minute, at least one. */
export const readingMinutes = (body: BlogBlock[]) => Math.max(1, Math.round(wordCount(bodyText(body)) / 200));

/** H2/H3 headings with stable, unique anchors (table of contents, deep links for AI answers). */
export function headings(body: BlogBlock[]) {
  const used = new Map<string, number>();
  return body
    .filter((b): b is Extract<BlogBlock, { kind: "h" }> => b.kind === "h")
    .map((b) => {
      const base = slugify(stripInline(b.text)) || "section";
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      return { blockId: b.id, level: b.level, text: stripInline(b.text), anchor: n ? `${base}-${n + 1}` : base };
    });
}

/** Internal site links in a body (product pages, other posts). */
export const internalLinks = (body: BlogBlock[]) =>
  body.flatMap((b) => (b.kind === "p" || b.kind === "quote" || b.kind === "callout" ? [b.text] : b.kind === "list" ? b.items : [])).flatMap((t) => parseInline(t).filter((x) => x.t === "a" && !x.external)).length + body.filter((b) => b.kind === "cta").length;

// ── SEO / GEO checklist (shown live in the console) ──
export type BlogCheck = { key: string; area: "seo" | "geo" | "content"; level: "good" | "warn" | "bad"; text: string };
const norm = (s: string) => s.toLowerCase().replace(/[‌]/g, " ").replace(/\s+/g, " ").trim();

/** Persian messages: the console is Persian. */
export function blogChecks(d: BlogPostData, locale: Locale): BlogCheck[] {
  const t = d.translations[locale];
  if (!t) return [{ key: "missing", area: "content", level: "bad", text: "این زبان هنوز نوشته نشده است." }];
  const out: BlogCheck[] = [];
  const add = (key: string, area: BlogCheck["area"], ok: boolean | "warn", good: string, bad: string) =>
    out.push({ key, area, level: ok === true ? "good" : ok === "warn" ? "warn" : "bad", text: ok === true ? good : bad });
  const title = t.seo.title?.trim() || t.title.trim();
  const desc = t.seo.description?.trim() || t.excerpt.trim();
  const text = bodyText(t.body);
  const words = wordCount(text);
  const first = t.body.find((b) => b.kind === "p");
  const kp = norm(t.seo.keyphrase ?? "");
  const range = (n: number, lo: number, hi: number) => (n >= lo && n <= hi ? true : n === 0 ? false : "warn");

  add("title", "seo", range([...title].length, 30, 60), `طول عنوان سئو خوب است (${[...title].length} نویسه).`, `عنوان سئو بهتر است ۳۰ تا ۶۰ نویسه باشد (الان ${[...title].length}).`);
  add("description", "seo", range([...desc].length, 70, 160), `توضیح متا اندازهٔ خوبی دارد (${[...desc].length} نویسه).`, `توضیح متا بهتر است ۷۰ تا ۱۶۰ نویسه باشد (الان ${[...desc].length}).`);
  add("slug", "seo", !!t.slug && validSlug(t.slug) && t.slug.length <= 80 ? true : !t.slug ? false : "warn", "نشانی (slug) کوتاه و تمیز است.", "نشانی (slug) خالی، طولانی یا نامعتبر است.");
  if (!kp) add("keyphrase", "seo", "warn", "", "عبارت کلیدی اصلی را مشخص کنید تا بررسی‌های مربوط به آن انجام شود.");
  else {
    add("kp-title", "seo", norm(title).includes(kp), "عبارت کلیدی در عنوان هست.", "عبارت کلیدی در عنوان نیست.");
    add("kp-desc", "seo", norm(desc).includes(kp) || "warn", "عبارت کلیدی در توضیح متا هست.", "عبارت کلیدی در توضیح متا نیست.");
    add("kp-first", "seo", (first?.kind === "p" && norm(stripInline(first.text)).includes(kp)) || "warn", "عبارت کلیدی در پاراگراف اول آمده.", "عبارت کلیدی را در پاراگراف اول بیاورید.");
    add("kp-slug", "seo", norm(t.slug.replace(/-/g, " ")).includes(kp) || "warn", "عبارت کلیدی در نشانی هست.", "عبارت کلیدی در نشانی (slug) نیست.");
  }
  const kws = (t.keywords ?? []).map(norm).filter(Boolean);
  add("keywords", "seo", kws.length >= 2 || "warn", `کلمات کلیدی فرعی: ${kws.length}.`, "دو یا چند کلمهٔ کلیدی فرعی (مترادف‌ها و عبارت‌های نزدیک) اضافه کنید.");
  if (kp) {
    const h2s = t.body.filter((b) => b.kind === "h").map((b) => norm(stripInline((b as { text: string }).text)));
    add("kp-heading", "seo", h2s.some((h) => h.includes(kp) || kws.some((k) => h.includes(k))) || "warn", "عبارت کلیدی یا مترادفش در یک سرتیتر آمده.", "عبارت کلیدی یا یکی از کلمات فرعی را در یک سرتیتر بیاورید.");
    const total = Math.max(1, words);
    const hits = norm(text).split(kp).length - 1;
    const density = (hits * kp.split(" ").length * 100) / total;
    add("kp-density", "seo", density >= 0.4 && density <= 3 ? true : "warn", `تکرار عبارت کلیدی مناسب است (${density.toFixed(1)}٪).`, density > 3 ? `عبارت کلیدی بیش از حد تکرار شده (${density.toFixed(1)}٪)؛ طبیعی بنویسید.` : `عبارت کلیدی کم تکرار شده (${density.toFixed(1)}٪).`);
  }
  const hs = t.body.filter((b) => b.kind === "h");
  const order = hs.every((h, i) => h.kind === "h" && (h.level === 2 || hs.slice(0, i).some((x) => x.kind === "h" && x.level === 2)));
  add("headings", "content", hs.length >= 2 && order ? true : hs.length ? "warn" : false, "ساختار سرتیترها درست است (H2 پیش از H3).", hs.length ? "پیش از هر H3 یک H2 بیاورید." : "متن را با سرتیترهای H2 بخش‌بندی کنید.");
  const imgs = t.body.filter((b) => b.kind === "image");
  add("alts", "seo", imgs.every((b) => b.kind === "image" && !!b.image.alt?.trim()), "همهٔ تصویرها متن جایگزین دارند.", "برای همهٔ تصویرها متن جایگزین (alt) بنویسید.");
  add("words", "content", words >= 600 ? true : words >= 300 ? "warn" : false, `حجم متن خوب است (${words} واژه).`, `متن کوتاه است (${words} واژه)؛ برای مقالهٔ مرجع دست‌کم ۶۰۰ واژه پیشنهاد می‌شود.`);
  add("links", "seo", internalLinks(t.body) >= 1 || d.products.length > 0 ? true : "warn", "به صفحه‌های سایت (محصول یا مقاله) پیوند داده شده.", "دست‌کم یک پیوند داخلی به صفحهٔ محصول یا مقالهٔ دیگر بگذارید.");
  add("cover", "seo", !!d.cover, "تصویر شاخص دارد.", "تصویر شاخص بگذارید (در گوگل دیسکاور و شبکه‌های اجتماعی دیده می‌شود).");
  add("excerpt", "geo", t.excerpt.trim().length >= 80 || "warn", "خلاصهٔ پاسخ‌محور دارد.", "یک خلاصهٔ کوتاه و پاسخ‌محور (دو جمله) بنویسید؛ موتورهای هوش مصنوعی آن را نقل می‌کنند.");
  add("takeaways", "geo", t.keyTakeaways.filter((x) => x.trim()).length >= 3 || "warn", "نکته‌های کلیدی (TL;DR) دارد.", "دست‌کم سه نکتهٔ کلیدی بنویسید.");
  add("faq", "geo", t.faq.filter((f) => f.q.trim() && f.a.trim()).length >= 2 || "warn", "پرسش‌های متداول دارد (FAQ schema).", "دو پرسش متداول یا بیشتر اضافه کنید.");
  add("sources", "geo", t.sources.length > 0 || "warn", "منبع‌ها ذکر شده‌اند.", "منبع‌های معتبر (استاندارد، مقاله، گزارش) را ذکر کنید.");
  add("author", "geo", !!d.authorId, "نویسنده مشخص است.", "نویسنده را انتخاب کنید (اعتبار و E-E-A-T).");
  const others = LOCALES.filter((l) => l !== locale && isLive(d.translations[l]));
  add("i18n", "seo", others.length > 0 || "warn", `ترجمه‌های دیگر: ${others.join("، ")} (hreflang خودکار).`, "این مقاله فقط به یک زبان است؛ ترجمه، دیده‌شدن در جست‌وجوی جهانی را بیشتر می‌کند.");
  return out;
}

/** 0–100: good counts full, warn half. */
export const checkScore = (checks: BlogCheck[]) => (checks.length ? Math.round((100 * checks.reduce((s, c) => s + (c.level === "good" ? 1 : c.level === "warn" ? 0.5 : 0), 0)) / checks.length) : 0);
