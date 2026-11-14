import raw from "@/content/blog.json";
import { DEFAULT_BLOG_SETTINGS, type BlogBlock, type BlogFaq, type BlogImage, type BlogProduct, type BlogSeo, type BlogSettings, type BlogSource } from "@arapoush/schema";
import type { Locale } from "@/lib/i18n";
import { entry, opexEnabled } from "@/lib/content";
import { overlay } from "@/lib/content/overlay";

/**
 * Blog (docs/opex/BLOG-PLAN.md). Posts come from the OPEX Delivery API, not from the content bundle:
 * a blog grows to hundreds of posts, and each page fetches only what it shows. Every fetch is tagged
 * `opex`, so a publish webhook refreshes articles, lists, the sitemap and the feeds at once.
 * Without OPEX the blog is empty (and its pages are noindex).
 */

export type L = Record<string, string>;
export const tx = (text: L | null | undefined, locale: string) => (text ? (text[locale] ?? text.en ?? text.fa ?? "") : "");
/** {n} placeholders. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

type Text = L;
export type BlogPage = {
  meta: { title: Text; description: Text };
  hero: { eyebrow: Text; title: Text; lead: Text };
  labels: Record<keyof (typeof raw)["labels"], Text>;
  products: Record<BlogProduct, { title: Text; text: Text; href: string }>;
};

/** Blog switches from OPEX settings (whole journal, each part, comment rules), with safe defaults. */
export function blogSettings(): BlogSettings {
  const s = entry<{ blog?: Partial<BlogSettings> }>("settings.site")?.blog;
  if (!s) return DEFAULT_BLOG_SETTINGS;
  return {
    ...DEFAULT_BLOG_SETTINGS,
    ...s,
    sections: { ...DEFAULT_BLOG_SETTINGS.sections, ...(s.sections ?? {}) },
    comments: { ...DEFAULT_BLOG_SETTINGS.comments, ...(s.comments ?? {}) },
  };
}

/** Blog page copy (OPEX `page.blog`, or content/blog.json without OPEX). */
export function getBlogPage(): BlogPage {
  // OPEX content over the code defaults: texts added later (new labels) keep their defaults until edited.
  const c = overlay(structuredClone(raw) as Record<string, unknown>, entry<Record<string, unknown>>("page.blog")) as Record<string, unknown>;
  delete c.$comment;
  return c as unknown as BlogPage;
}

export type BlogCard = {
  id: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  cover: BlogImage | null;
  category: { id: string; name: string; slug: string } | null;
  author: { id: string; name: string; slug: string } | null;
  publishedAt: string;
  modifiedAt: string;
  readingMinutes: number;
  featured: boolean;
};
export type BlogAuthor = { id: string; slug: string; name: string; role: string; bio: string; expertise: string[]; photo: BlogImage | null; sameAs: string[] };
export type BlogPost = BlogCard & {
  body: BlogBlock[];
  keyTakeaways: string[];
  faq: BlogFaq[];
  sources: BlogSource[];
  seo: BlogSeo;
  products: BlogProduct[];
  tags: { name: string; slug: string }[];
  author: BlogAuthor | null;
  reviewer: BlogAuthor | null;
  wordCount: number;
  alternates: Partial<Record<Locale, string>>;
  related: BlogCard[];
  keywords: string[];
  comments: BlogComment[];
  commentsOpen: boolean;
};
export type BlogComment = { id: string; name: string; body: string; team: boolean; createdAt: string; replies?: BlogComment[] };
type LocText = Partial<Record<Locale, string>>;
export type BlogIndex = {
  posts: (BlogCard & { alternates: Partial<Record<Locale, string>>; noindex: boolean; keyTakeaways: string[] })[];
  categories: { id: string; name: LocText; slug: LocText; description: LocText; position: number }[];
  authors: { id: string; slug: string; name: LocText; role: LocText; bio: LocText; expertise: string[]; photo: BlogImage | null; sameAs: string[] }[];
};
export type BlogList = { items: BlogCard[]; total: number; page: number; pages: number };

const base = () => process.env.OPEX_DELIVERY_URL?.replace(/\/$/, "");

async function get<T>(path: string, init: RequestInit & { next?: { tags?: string[]; revalidate?: number } } = { cache: "force-cache", next: { tags: ["opex", "opex-blog"], revalidate: 3600 } }): Promise<{ status: number; body: T | null }> {
  if (!opexEnabled()) return { status: 503, body: null };
  try {
    const res = await fetch(`${base()}${path}`, { ...init, headers: { authorization: `Bearer ${process.env.OPEX_DELIVERY_TOKEN}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { status: res.status, body: null };
    return { status: 200, body: (await res.json()) as T };
  } catch (e) {
    console.warn(`[blog] ${path}: ${(e as Error).message}`);
    return { status: 503, body: null };
  }
}

export const PER_PAGE = 12;
/** Page size from the blog settings (OPEX), 12 by default. */
export const perPage = () => blogSettings().perPage || PER_PAGE;
const EMPTY: BlogList = { items: [], total: 0, page: 1, pages: 1 };

export async function listPosts(locale: Locale, o: { page?: number; category?: string; tag?: string; author?: string; per?: number } = {}): Promise<BlogList> {
  const q = new URLSearchParams({ locale, page: String(o.page ?? 1), per: String(o.per ?? perPage()) });
  if (o.category) q.set("category", o.category);
  if (o.tag) q.set("tag", o.tag);
  if (o.author) q.set("author", o.author);
  return (await get<BlogList>(`/v1/delivery/blog/posts?${q}`)).body ?? EMPTY;
}

/** The post, `{ redirect }` for an old slug, or null (404). */
export async function getPost(locale: Locale, slug: string): Promise<{ post?: BlogPost; redirect?: string } | null> {
  const r = await get<{ post?: BlogPost; redirect?: string }>(`/v1/delivery/blog/post?${new URLSearchParams({ locale, slug })}`);
  return r.body;
}

export async function getBlogIndex(): Promise<BlogIndex> {
  return (await get<BlogIndex>("/v1/delivery/blog/index")).body ?? { posts: [], categories: [], authors: [] };
}

export async function getPreview(id: string, locale: Locale, token: string): Promise<BlogPost | null> {
  const r = await get<{ post: BlogPost }>(`/v1/delivery/blog/preview/${encodeURIComponent(id)}?locale=${locale}`, { cache: "no-store", headers: { "opex-preview": token } });
  return r.body?.post ?? null;
}

/** Live posts matching a query (noindex search page; never cached). */
export async function searchPosts(locale: Locale, q: string): Promise<BlogCard[]> {
  if (q.trim().length < 2) return [];
  const r = await get<{ items: BlogCard[] }>(`/v1/delivery/blog/search?${new URLSearchParams({ locale, q: q.trim().slice(0, 100) })}`, { cache: "no-store" });
  return r.body?.items ?? [];
}

/** Forwards a visitor's form to OPEX with the delivery token and the visitor's IP (comments, newsletter). */
export async function postToOpex(path: string, body: unknown, ip?: string) {
  if (!opexEnabled()) return { status: 503, body: null as unknown };
  try {
    const res = await fetch(`${base()}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPEX_DELIVERY_TOKEN}`, "content-type": "application/json", ...(ip ? { "x-end-user-ip": ip } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
  } catch {
    return { status: 503, body: null as unknown };
  }
}

export const blogPath = (slug?: string) => (slug ? `/blog/${encodeURIComponent(slug)}` : "/blog");
export const categoryPath = (slug: string) => `/blog/category/${encodeURIComponent(slug)}`;
export const authorPath = (slug: string) => `/blog/author/${encodeURIComponent(slug)}`;
export const pagePath = (n: number) => (n <= 1 ? "/blog" : `/blog/page/${n}`);
