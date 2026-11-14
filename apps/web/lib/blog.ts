import raw from "@/content/blog.json";
import type { BlogBlock, BlogFaq, BlogImage, BlogProduct, BlogSeo, BlogSource } from "@arapoush/schema";
import type { Locale } from "@/lib/i18n";
import { entry, opexEnabled } from "@/lib/content";

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
  labels: Record<
    | "home"
    | "blog"
    | "all"
    | "featured"
    | "latest"
    | "readMore"
    | "minutes"
    | "published"
    | "updated"
    | "by"
    | "reviewedBy"
    | "toc"
    | "takeaways"
    | "faq"
    | "sources"
    | "related"
    | "relatedProducts"
    | "share"
    | "page"
    | "prev"
    | "next"
    | "pagination"
    | "categories"
    | "empty"
    | "authorPosts"
    | "categoryPosts"
    | "backToBlog"
    | "rss"
    | "tags"
    | "expertise"
    | "preview",
    Text
  >;
  products: Record<BlogProduct, { title: Text; text: Text; href: string }>;
};

/** Blog page copy (OPEX `page.blog`, or content/blog.json without OPEX). */
export function getBlogPage(): BlogPage {
  const c = structuredClone(entry<Record<string, unknown>>("page.blog") ?? raw) as Record<string, unknown>;
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
};
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
const EMPTY: BlogList = { items: [], total: 0, page: 1, pages: 1 };

export async function listPosts(locale: Locale, o: { page?: number; category?: string; tag?: string; author?: string; per?: number } = {}): Promise<BlogList> {
  const q = new URLSearchParams({ locale, page: String(o.page ?? 1), per: String(o.per ?? PER_PAGE) });
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

export const blogPath = (slug?: string) => (slug ? `/blog/${encodeURIComponent(slug)}` : "/blog");
export const categoryPath = (slug: string) => `/blog/category/${encodeURIComponent(slug)}`;
export const authorPath = (slug: string) => `/blog/author/${encodeURIComponent(slug)}`;
export const pagePath = (n: number) => (n <= 1 ? "/blog" : `/blog/page/${n}`);
