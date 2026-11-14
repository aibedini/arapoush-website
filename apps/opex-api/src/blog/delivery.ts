import type { FastifyInstance, FastifyRequest } from "fastify";
import { commentsOpen, FALLBACK, isLive, LOCALES, readingMinutes, wordCount, bodyText, type BlogPostData, type Locale } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import type { Q } from "../db/index.ts";
import { forbidden, notFound, unauthorized } from "../http/problem.ts";
import { safeEqual } from "../ids.ts";
import { readPreviewToken } from "../delivery/preview.ts";
import { blogSettings, publicComments } from "./community.ts";
import { BLOG_DELIVERY } from "./contract.ts";

type Loc = Partial<Record<Locale, string>>;
type CategoryRow = { id: string; name: Loc; slug: Loc; description: Loc; position: number };
type TagRow = { id: string; name: Loc; slug: string };
type AuthorRow = { id: string; slug: string; name: Loc; role: Loc; bio: Loc; expertise: string[]; photo: unknown; same_as: string[] };
type LivePost = { id: string; first_published_at: Date; published_at: Date; data: BlogPostData };

const pick = (v: Loc | undefined, l: Locale) => {
  for (const x of FALLBACK[l]) if (v?.[x]) return v[x]!;
  return "";
};
const iso = (d: Date | string) => new Date(d).toISOString();

export async function taxonomy(q: Q, tenant: string) {
  const [categories, tags, authors] = await Promise.all([
    q<CategoryRow>(`SELECT id, name, slug, description, position FROM blog_categories WHERE tenant_id = $1 ORDER BY position, created_at`, [tenant]),
    q<TagRow>(`SELECT id, name, slug FROM blog_tags WHERE tenant_id = $1`, [tenant]),
    q<AuthorRow>(`SELECT id, slug, name, role, bio, expertise, photo, same_as FROM blog_authors WHERE tenant_id = $1`, [tenant]),
  ]);
  return { categories, tags, authors, cat: new Map(categories.map((c) => [c.id, c])), tag: new Map(tags.map((t) => [t.id, t])), author: new Map(authors.map((a) => [a.id, a])) };
}
type Tax = Awaited<ReturnType<typeof taxonomy>>;

const authorOut = (a: AuthorRow | undefined, l: Locale) =>
  a ? { id: a.id, slug: a.slug, name: pick(a.name, l), role: pick(a.role, l), bio: pick(a.bio, l), expertise: a.expertise ?? [], photo: a.photo ?? null, sameAs: a.same_as ?? [] } : null;
const categoryOut = (c: CategoryRow | undefined, l: Locale) => (c ? { id: c.id, name: pick(c.name, l), slug: c.slug?.[l] ?? "" } : null);

/** A list card for one translation. */
export function card(p: LivePost, l: Locale, tax: Tax) {
  const t = p.data.translations[l]!;
  const a = tax.author.get(p.data.authorId ?? "");
  return {
    id: p.id,
    locale: l,
    slug: t.slug,
    title: t.title,
    excerpt: t.excerpt,
    cover: p.data.cover ?? null,
    category: categoryOut(tax.cat.get(p.data.categoryId ?? ""), l),
    author: a ? { id: a.id, name: pick(a.name, l), slug: a.slug } : null,
    publishedAt: iso(p.first_published_at),
    modifiedAt: iso(p.published_at),
    readingMinutes: readingMinutes(t.body),
    featured: p.data.featured,
  };
}

const alternatesOf = (d: BlogPostData) => Object.fromEntries(LOCALES.filter((l) => isLive(d.translations[l])).map((l) => [l, d.translations[l]!.slug]));

/** Everything the article page renders for one translation. */
export function fullPost(p: LivePost, l: Locale, tax: Tax, all: LivePost[]) {
  const t = p.data.translations[l]!;
  const inLocale = all.filter((x) => x.id !== p.id && isLive(x.data.translations[l]));
  // Related: chosen ones first, then the same category, then the newest.
  // Related: chosen ones first, then the most similar (shared tags, category, keywords, title words).
  const words = (d: BlogPostData) => {
    const tt = d.translations[l]!;
    return new Set([tt.title, tt.seo.keyphrase ?? "", ...(tt.keywords ?? [])].join(" ").toLowerCase().replace(/‌/g, " ").split(/[^p{L}p{N}]+/u).filter((w) => w.length > 2));
  };
  const mine = words(p.data);
  const sim = (x: LivePost) => {
    const theirs = words(x.data);
    const overlap = [...mine].filter((w) => theirs.has(w)).length / Math.max(1, Math.min(mine.size, theirs.size));
    return 3 * x.data.tagIds.filter((t) => p.data.tagIds.includes(t)).length + (p.data.categoryId && x.data.categoryId === p.data.categoryId ? 2 : 0) + 4 * overlap;
  };
  const related = [...p.data.relatedIds.map((id) => inLocale.find((x) => x.id === id)).filter((x): x is LivePost => !!x), ...[...inLocale].sort((a, b) => sim(b) - sim(a))]
    .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i)
    .slice(0, 3)
    .map((x) => card(x, l, tax));
  return {
    ...card(p, l, tax),
    body: t.body,
    keyTakeaways: t.keyTakeaways.filter((x) => x.trim()),
    faq: t.faq.filter((f) => f.q.trim() && f.a.trim()),
    sources: t.sources,
    seo: t.seo,
    keywords: (t.keywords ?? []).filter((x) => x.trim()),
    products: p.data.products,
    tags: p.data.tagIds.map((id) => tax.tag.get(id)).filter((x): x is TagRow => !!x).map((x) => ({ name: pick(x.name, l), slug: x.slug })),
    author: authorOut(tax.author.get(p.data.authorId ?? ""), l),
    reviewer: authorOut(tax.author.get(p.data.reviewerId ?? ""), l),
    wordCount: wordCount(bodyText(t.body)),
    alternates: alternatesOf(p.data),
    related,
  };
}

/** Delivery API for the blog: the website's server only (bearer token). */
export async function blogDeliveryModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const guard = async (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw unauthorized();
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };
  const cache = { "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=86400" };
  const rate = { rateLimit: { max: 3000, timeWindow: "1 minute" } };
  const livePosts = () =>
    db.q<LivePost>(
      `SELECT p.id, p.first_published_at, p.published_at, r.data FROM blog_posts p JOIN blog_revisions r ON r.id = p.published_revision_id
        WHERE p.tenant_id = $1 AND p.status = 'published' ORDER BY p.first_published_at DESC, p.id`,
      [tenant],
    );

  app.get("/v1/delivery/blog/posts", { preHandler: guard, config: rate }, async (req, reply) => {
    const { locale, page, per, category, tag, author } = BLOG_DELIVERY.list.query.parse(req.query);
    const [posts, tax] = await Promise.all([livePosts(), taxonomy(db.q, tenant)]);
    const catId = category ? tax.categories.find((c) => c.slug?.[locale] === category)?.id : undefined;
    const tagId = tag ? tax.tags.find((t) => t.slug === tag)?.id : undefined;
    const authorId = author ? tax.authors.find((a) => a.slug === author)?.id : undefined;
    const hit = posts.filter(
      (p) => isLive(p.data.translations[locale]) && (!category || p.data.categoryId === catId) && (!tag || (!!tagId && p.data.tagIds.includes(tagId))) && (!author || p.data.authorId === authorId),
    );
    reply.headers(cache);
    const pages = Math.max(1, Math.ceil(hit.length / per));
    return { items: hit.slice((page - 1) * per, page * per).map((p) => card(p, locale, tax)), total: hit.length, page, pages };
  });

  app.get("/v1/delivery/blog/post", { preHandler: guard, config: rate }, async (req, reply) => {
    const { locale, slug } = BLOG_DELIVERY.post.query.parse(req.query);
    const [row] = await db.q<{ post_id: string; current: boolean }>(`SELECT post_id, current FROM blog_slugs WHERE tenant_id = $1 AND locale = $2 AND slug = $3`, [tenant, locale, slug]);
    if (!row) throw notFound("Post");
    const [posts, tax] = await Promise.all([livePosts(), taxonomy(db.q, tenant)]);
    const p = posts.find((x) => x.id === row.post_id);
    const t = p?.data.translations[locale];
    if (!p || !isLive(t)) throw notFound("Post");
    reply.headers(cache);
    // An old slug: the page answers 301 to the current one, keeping its links and ranking.
    if (t.slug !== slug) return { redirect: t.slug };
    const [settings, comments] = await Promise.all([blogSettings(db.q, tenant), publicComments(db.q, p.id, locale)]);
    return { post: { ...fullPost(p, locale, tax, posts), comments, commentsOpen: commentsOpen(settings, p.data, p.first_published_at) } };
  });

  app.get("/v1/delivery/blog/index", { preHandler: guard, config: rate }, async (_req, reply) => {
    const [posts, tax] = await Promise.all([livePosts(), taxonomy(db.q, tenant)]);
    reply.headers(cache);
    return {
      posts: posts.flatMap((p) =>
        LOCALES.filter((l) => isLive(p.data.translations[l])).map((l) => ({
          ...card(p, l, tax),
          alternates: alternatesOf(p.data),
          noindex: !!p.data.translations[l]!.seo.noindex,
          keyTakeaways: p.data.translations[l]!.keyTakeaways.filter((x) => x.trim()),
        })),
      ),
      categories: tax.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, position: c.position })),
      authors: tax.authors.map((a) => ({ id: a.id, slug: a.slug, name: a.name, role: a.role, bio: a.bio, expertise: a.expertise ?? [], photo: a.photo ?? null, sameAs: a.same_as ?? [] })),
    };
  });

  app.get("/v1/delivery/blog/preview/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = BLOG_DELIVERY.preview.params.parse(req.params);
    const { locale } = BLOG_DELIVERY.preview.query.parse(req.query);
    // The token names one post: a link to preview one draft never opens another.
    const payload = await readPreviewToken(config, String(req.headers["opex-preview"] ?? ""));
    if (!payload || payload.type !== `blog.post:${id}` || payload.partner) throw unauthorized("Preview link expired");
    const [row] = await db.q<{ id: string; first_published_at: Date | null; published_at: Date | null; data: BlogPostData }>(
      `SELECT p.id, p.first_published_at, p.published_at, r.data FROM blog_posts p JOIN blog_revisions r ON r.id = p.draft_revision_id WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenant],
    );
    const t = row?.data.translations[locale];
    if (!row || !t || !t.title) throw notFound("Post");
    const now = new Date();
    const draft: LivePost = { id: row.id, first_published_at: row.first_published_at ?? now, published_at: now, data: { ...row.data, translations: { ...row.data.translations, [locale]: { ...t, enabled: true, slug: t.slug || "preview" } } } };
    const [posts, tax] = await Promise.all([livePosts(), taxonomy(db.q, tenant)]);
    reply.header("Cache-Control", "no-store");
    return { post: { ...fullPost(draft, locale, tax, posts), comments: await publicComments(db.q, row.id, locale), commentsOpen: false } };
  });
}

import type { Job } from "../workers.ts";
import { SYSTEM_ACTOR, SYSTEM_REQUEST } from "../audit/audit.ts";
import { publishPost } from "./service.ts";
/** Publishes posts whose time has come (the schedule is cleared on publish, so a rerun is harmless). */
export const blogScheduledPublish: Job = {
  name: "blog-scheduled-publish",
  everyMs: 30_000,
  async run({ db, config }, log) {
    const due = await db.q<{ id: string }>(`SELECT id FROM blog_posts WHERE tenant_id = $1 AND scheduled_at IS NOT NULL AND scheduled_at <= clock_timestamp() AND status <> 'archived'`, [config.TENANT]);
    for (const p of due) {
      try {
        await db.tx((q) => publishPost(q, config.TENANT, { id: p.id, actor: { ...SYSTEM_ACTOR, display: "Scheduler" }, request: SYSTEM_REQUEST, trigger: "schedule", config }));
      } catch (e) {
        // A post that cannot go live (slug taken, image not clean) leaves the schedule (no retry every 30 s) and is logged.
        log.warn({ post: p.id, err: (e as Error).message }, "scheduled blog post not published");
        await db.q(`UPDATE blog_posts SET scheduled_at = NULL, status = CASE WHEN published_revision_id IS NULL THEN 'draft' ELSE 'published' END WHERE id = $1`, [p.id]);
      }
    }
  },
};
