import { LOCALES, liveLocales, type BlogPostData, type Locale } from "@arapoush/schema";
import { audit, type Actor, type RequestInfo } from "../audit/audit.ts";
import type { Q } from "../db/index.ts";
import { badRequest, conflict, notFound } from "../http/problem.ts";
import { canonical, sha256, ulid } from "../ids.ts";
import { diff } from "../content/diff.ts";
import { referencedMedia } from "../content/service.ts";
import { enqueueSiteWebhook } from "../webhooks/outbox.ts";
import type { Config } from "../config.ts";
import { notifySubscribers } from "./community.ts";

export type PostRow = {
  id: string;
  status: "draft" | "review" | "scheduled" | "published" | "archived";
  draft_revision_id: string | null;
  published_revision_id: string | null;
  scheduled_at: Date | null;
  first_published_at: Date | null;
  published_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};
export type BlogRevRow = { id: string; post_id: string; number: number; data: BlogPostData; created_at: Date; author_principal_id: string | null; note: string | null };

export async function loadPost(q: Q, tenant: string, id: string, lock = false): Promise<PostRow> {
  const [p] = await q<PostRow>(`SELECT * FROM blog_posts WHERE id = $1 AND tenant_id = $2 ${lock ? "FOR UPDATE" : ""}`, [id, tenant]);
  if (!p) throw notFound("Post");
  return p;
}

export async function loadRevision(q: Q, postId: string, revId: string): Promise<BlogRevRow> {
  const [r] = await q<BlogRevRow>(`SELECT * FROM blog_revisions WHERE id = $1 AND post_id = $2`, [revId, postId]);
  if (!r) throw notFound("Revision");
  return r;
}

/** Slugs another post holds (live or as a redirect source) are refused. */
export async function assertSlugsFree(q: Q, tenant: string, postId: string, data: BlogPostData) {
  for (const l of LOCALES) {
    const slug = data.translations[l]?.slug;
    if (!slug) continue;
    const [other] = await q<{ post_id: string }>(`SELECT post_id FROM blog_slugs WHERE tenant_id = $1 AND locale = $2 AND slug = $3 AND post_id <> $4`, [tenant, l, slug, postId]);
    if (other) throw conflict("SLUG_TAKEN", `The ${l} slug "${slug}" belongs to another post`, { locale: l, slug });
  }
}

/** A new immutable revision; returns the old one when nothing changed. */
export async function saveRevision(q: Q, tenant: string, o: { post: PostRow; data: BlogPostData; actor: Actor; request: RequestInfo; note?: string; action?: string }) {
  const prev = o.post.draft_revision_id ? await loadRevision(q, o.post.id, o.post.draft_revision_id) : null;
  const changes = diff(prev?.data ?? {}, o.data);
  if (prev && changes.length === 0) return { rev: prev, changed: false };
  const [{ n }] = (await q<{ n: number }>(`SELECT coalesce(max(number), 0) + 1 AS n FROM blog_revisions WHERE post_id = $1`, [o.post.id])) as [{ n: number }];
  const id = ulid("brv_");
  const [rev] = await q<BlogRevRow>(
    `INSERT INTO blog_revisions (id, post_id, number, data, data_hash, author_principal_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, o.post.id, n, JSON.stringify(o.data), sha256(canonical(o.data)), o.actor.id, o.note ?? null],
  );
  await q(`UPDATE blog_posts SET draft_revision_id = $2, updated_at = clock_timestamp() WHERE id = $1`, [o.post.id, id]);
  await audit(q, tenant, { action: o.action ?? "blog.post.save", actor: o.actor, request: o.request, resource: { type: "blog_post", id: o.post.id, revision: id, number: n }, changes: changes.slice(0, 300) });
  return { rev: rev!, changed: true };
}

/** Makes the draft live: slugs (old ones keep redirecting), clean media made public, the site told. */
export async function publishPost(q: Q, tenant: string, o: { id: string; actor: Actor; request: RequestInfo; trigger: "manual" | "schedule"; config?: Config }) {
  const post = await loadPost(q, tenant, o.id, true);
  if (post.status === "archived") throw conflict("ARCHIVED", "The post is archived");
  if (!post.draft_revision_id) throw badRequest("NOTHING_LIVE", "The post has no content yet");
  const rev = await loadRevision(q, post.id, post.draft_revision_id);
  const live = liveLocales(rev.data);
  if (!live.length) throw badRequest("NOTHING_LIVE", "Enable and complete at least one translation (title, slug and body)");
  await assertSlugsFree(q, tenant, post.id, rev.data);
  const media = referencedMedia(rev.data);
  if (media.length) {
    const bad = await q<{ id: string; status: string }>(`SELECT id, status FROM assets WHERE id = ANY($1) AND status <> 'clean'`, [media]);
    if (bad.length) throw badRequest("MEDIA_NOT_CLEAN", "Some images are not scanned clean yet", { assets: bad });
    await q(`UPDATE assets SET public = true WHERE id = ANY($1)`, [media]);
  }
  for (const l of LOCALES) {
    const slug = live.includes(l) ? rev.data.translations[l]!.slug : null;
    await q(`UPDATE blog_slugs SET current = false WHERE post_id = $1 AND locale = $2 AND current AND slug IS DISTINCT FROM $3`, [post.id, l, slug]);
    if (slug) await q(`INSERT INTO blog_slugs (tenant_id, locale, slug, post_id, current) VALUES ($1,$2,$3,$4,true) ON CONFLICT (tenant_id, locale, slug) DO UPDATE SET current = true`, [tenant, l, slug, post.id]);
  }
  const previous = post.published_revision_id;
  await q(
    `UPDATE blog_posts SET published_revision_id = $2, status = 'published', scheduled_at = NULL, published_at = clock_timestamp(),
            first_published_at = COALESCE(first_published_at, clock_timestamp()), updated_at = clock_timestamp() WHERE id = $1`,
    [post.id, rev.id],
  );
  await audit(q, tenant, { action: "blog.post.publish", actor: o.actor, request: o.request, resource: { type: "blog_post", id: post.id, revision: rev.id, number: rev.number, previous, live, trigger: o.trigger } });
  await enqueueSiteWebhook(q, tenant, "blog.published", { post: post.id, revision: rev.id, live });
  // Subscribers hear about a post once, at its first publish with "notify" ticked.
  if (o.config) await notifySubscribers(q, o.config, post.id, rev.data);
  return { live: live as Locale[] };
}

/** The site refreshes lists, sitemap and feeds (unpublish, archive, taxonomy changes). */
export const notifySite = (q: Q, tenant: string, event: string, data: Record<string, unknown>) => enqueueSiteWebhook(q, tenant, event, data);
