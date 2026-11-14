import type { FastifyInstance, FastifyRequest } from "fastify";
import { emptyPost, isLive, LOCALES, type BlogPostData } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, conflict, forbidden, notFound, Problem } from "../http/problem.ts";
import { ulid } from "../ids.ts";
import { previewLink } from "../delivery/preview.ts";
import { AuthorBody, BLOG, CategoryBody, PostData, TagBody } from "./contract.ts";
import { assertSlugsFree, loadPost, loadRevision, notifySite, publishPost, saveRevision, type PostRow } from "./service.ts";

const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
const asList = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/** Blog in the OPEX console (docs/opex/BLOG-PLAN.md). */
export async function blogModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const op = requireOperator(deps);
  const has = (req: FastifyRequest, p: string) => !!req.principal?.permissions?.has(p);
  /** Authors edit their own posts; editing someone else's needs blog.edit_others. */
  const assertCanEdit = (req: FastifyRequest, post: PostRow) => {
    if (post.created_by !== req.principal!.id && !has(req, "blog.edit_others")) throw forbidden("NOT_YOUR_POST", "This post was written by someone else");
  };
  const idOf = (req: FastifyRequest) => BLOG.get.params.parse(req.params).id;

  // ── Posts ──
  app.get("/v1/manage/blog/posts", { preHandler: op }, async (req) => {
    const { status, q, mine } = BLOG.list.query.parse(req.query);
    const me = req.principal!.id;
    const rows = await db.q<PostRow & { draft: BlogPostData | null; live: BlogPostData | null }>(
      `SELECT p.*, d.data AS draft, l.data AS live FROM blog_posts p
         LEFT JOIN blog_revisions d ON d.id = p.draft_revision_id
         LEFT JOIN blog_revisions l ON l.id = p.published_revision_id
        WHERE p.tenant_id = $1 ${status ? "AND p.status = $2" : "AND p.status <> 'archived'"} ${mine ? `AND p.created_by = $${status ? 3 : 2}` : ""}
        ORDER BY p.updated_at DESC LIMIT 500`,
      [tenant, ...(status ? [status] : []), ...(mine ? [me] : [])],
    );
    const needle = q?.trim().toLowerCase();
    return rows
      .map((p) => {
        const d = p.draft ?? emptyPost();
        const titles = Object.fromEntries(LOCALES.filter((l) => d.translations[l]?.title).map((l) => [l, d.translations[l]!.title]));
        return {
          id: p.id,
          status: p.status,
          titles,
          live: p.live ? LOCALES.filter((l) => isLive(p.live!.translations[l])) : [],
          ready: LOCALES.filter((l) => isLive(d.translations[l])),
          categoryId: d.categoryId,
          authorId: d.authorId,
          cover: d.cover?.src ?? null,
          featured: d.featured,
          unpublishedChanges: !!p.published_revision_id && p.published_revision_id !== p.draft_revision_id,
          createdBy: p.created_by,
          mine: p.created_by === me,
          updatedAt: iso(p.updated_at)!,
          publishedAt: iso(p.published_at),
          scheduledAt: iso(p.scheduled_at),
        };
      })
      .filter((p) => !needle || Object.values(p.titles).some((t) => t.toLowerCase().includes(needle)));
  });

  app.post("/v1/manage/blog/posts", { preHandler: op }, async (req) => {
    const body = BLOG.create.body.parse(req.body ?? {});
    const me = req.principal!.id;
    // The writer's own author profile, when one is linked to their account.
    const [author] = await db.q<{ id: string }>(`SELECT id FROM blog_authors WHERE tenant_id = $1 AND principal_id = $2 LIMIT 1`, [tenant, me]);
    const data = (body.data ?? { ...emptyPost(), authorId: author?.id ?? null }) as BlogPostData;
    const id = ulid("pst_");
    return db.tx(async (q) => {
      await assertSlugsFree(q, tenant, id, data);
      await q(`INSERT INTO blog_posts (id, tenant_id, created_by) VALUES ($1,$2,$3)`, [id, tenant, me]);
      const post = await loadPost(q, tenant, id, true);
      const { rev } = await saveRevision(q, tenant, { post, data, actor: actorOf(req), request: req.info, action: "blog.post.create" });
      return { id, revisionId: rev.id };
    });
  });

  app.get("/v1/manage/blog/posts/:id", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const p = await loadPost(db.q, tenant, id);
    const rev = p.draft_revision_id ? await loadRevision(db.q, id, p.draft_revision_id) : null;
    const slugs = await db.q<{ locale: string; slug: string; current: boolean }>(`SELECT locale, slug, current FROM blog_slugs WHERE post_id = $1 ORDER BY locale, current DESC, created_at DESC`, [id]);
    const own = p.created_by === req.principal!.id;
    return {
      id,
      status: p.status,
      data: rev?.data ?? emptyPost(),
      draftRevisionId: p.draft_revision_id,
      publishedRevisionId: p.published_revision_id,
      revision: rev?.number ?? 0,
      createdBy: p.created_by,
      createdAt: iso(p.created_at)!,
      updatedAt: iso(p.updated_at)!,
      firstPublishedAt: iso(p.first_published_at),
      publishedAt: iso(p.published_at),
      scheduledAt: iso(p.scheduled_at),
      slugs,
      can: { edit: has(req, "blog.write") && (own || has(req, "blog.edit_others")), publish: has(req, "blog.publish"), delete: has(req, "blog.delete") },
    };
  });

  app.put("/v1/manage/blog/posts/:id", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const body = BLOG.save.body.parse(req.body);
    const data = PostData.parse(body.data) as BlogPostData;
    return db.tx(async (q) => {
      const post = await loadPost(q, tenant, id, true);
      assertCanEdit(req, post);
      if (post.status === "archived") throw conflict("ARCHIVED", "The post is archived");
      if (post.draft_revision_id !== body.baseRevisionId) throw new Problem(412, "CONFLICT_BASE_REVISION", "The post changed since you opened it; reload and reapply your edits", { current: post.draft_revision_id });
      await assertSlugsFree(q, tenant, id, data);
      const { rev, changed } = await saveRevision(q, tenant, { post, data, actor: actorOf(req), request: req.info, note: body.note });
      // An edited post in review goes back to draft only if the author changes it after an editor looked: kept simple, it stays in review.
      return { revisionId: rev.id, revision: rev.number, changed };
    });
  });

  app.post("/v1/manage/blog/posts/:id/submit", { preHandler: op }, async (req) => {
    const id = idOf(req);
    await db.tx(async (q) => {
      const post = await loadPost(q, tenant, id, true);
      assertCanEdit(req, post);
      if (post.status !== "draft" && post.status !== "published") throw conflict("WRONG_STATE", `A ${post.status} post cannot go to review`);
      await q(`UPDATE blog_posts SET status = 'review', updated_at = clock_timestamp() WHERE id = $1`, [id]);
      await audit(q, tenant, { action: "blog.post.submit", actor: actorOf(req), request: req.info, resource: { type: "blog_post", id } });
    });
    return { ok: true };
  });

  app.post("/v1/manage/blog/posts/:id/publish", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const { at } = BLOG.publish.body.parse(req.body ?? {});
    if (at && new Date(at).getTime() > Date.now() + 30_000) {
      return db.tx(async (q) => {
        const post = await loadPost(q, tenant, id, true);
        if (post.status === "archived") throw conflict("ARCHIVED", "The post is archived");
        const rev = post.draft_revision_id ? await loadRevision(q, id, post.draft_revision_id) : null;
        if (!rev || !LOCALES.some((l) => isLive(rev.data.translations[l]))) throw badRequest("NOTHING_LIVE", "Enable and complete at least one translation (title, slug and body)");
        await assertSlugsFree(q, tenant, id, rev.data);
        // A live post keeps its live version until the scheduled one replaces it.
        await q(`UPDATE blog_posts SET scheduled_at = $2, status = CASE WHEN published_revision_id IS NULL THEN 'scheduled' ELSE status END, updated_at = clock_timestamp() WHERE id = $1`, [id, at]);
        await audit(q, tenant, { action: "blog.post.schedule", actor: actorOf(req), request: req.info, resource: { type: "blog_post", id, at } });
        const [p] = await q<{ status: PostRow["status"] }>(`SELECT status FROM blog_posts WHERE id = $1`, [id]);
        return { status: p!.status, live: [] as string[], scheduledAt: new Date(at).toISOString() };
      });
    }
    const r = await db.tx((q) => publishPost(q, tenant, { id, actor: actorOf(req), request: req.info, trigger: "manual", config }));
    return { status: "published" as const, live: r.live, scheduledAt: null };
  });

  app.post("/v1/manage/blog/posts/:id/unpublish", { preHandler: op }, async (req) => {
    const id = idOf(req);
    await db.tx(async (q) => {
      await loadPost(q, tenant, id, true);
      await q(`UPDATE blog_posts SET published_revision_id = NULL, published_at = NULL, scheduled_at = NULL, status = 'draft', updated_at = clock_timestamp() WHERE id = $1`, [id]);
      await audit(q, tenant, { action: "blog.post.unpublish", actor: actorOf(req), request: req.info, resource: { type: "blog_post", id } });
      await notifySite(q, tenant, "blog.unpublished", { post: id });
    });
    return { ok: true };
  });

  app.delete("/v1/manage/blog/posts/:id", { preHandler: op }, async (req) => {
    const id = idOf(req);
    await db.tx(async (q) => {
      const post = await loadPost(q, tenant, id, true);
      await q(`UPDATE blog_posts SET status = 'archived', published_revision_id = NULL, published_at = NULL, scheduled_at = NULL, updated_at = clock_timestamp() WHERE id = $1`, [id]);
      await audit(q, tenant, { action: "blog.post.archive", actor: actorOf(req), request: req.info, resource: { type: "blog_post", id, was: post.status } });
      if (post.published_revision_id) await notifySite(q, tenant, "blog.unpublished", { post: id });
    });
    return { ok: true };
  });

  app.get("/v1/manage/blog/posts/:id/revisions", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const p = await loadPost(db.q, tenant, id);
    const rows = await db.q<{ id: string; number: number; created_at: Date; author: string | null; note: string | null }>(
      `SELECT r.id, r.number, r.created_at, COALESCE(pr.display_name, r.author_principal_id) AS author, r.note
         FROM blog_revisions r LEFT JOIN principals pr ON pr.id = r.author_principal_id WHERE r.post_id = $1 ORDER BY r.number DESC LIMIT 200`,
      [id],
    );
    return rows.map((r) => ({ id: r.id, number: r.number, createdAt: iso(r.created_at)!, author: r.author, note: r.note, published: r.id === p.published_revision_id, draft: r.id === p.draft_revision_id }));
  });

  app.get("/v1/manage/blog/posts/:id/revisions/:rev", { preHandler: op }, async (req) => {
    const { id, rev } = BLOG.revision.params.parse(req.params);
    await loadPost(db.q, tenant, id);
    const r = await loadRevision(db.q, id, rev);
    return { id: r.id, number: r.number, data: r.data, createdAt: iso(r.created_at)! };
  });

  app.post("/v1/manage/blog/posts/:id/restore", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const { revisionId } = BLOG.restore.body.parse(req.body);
    return db.tx(async (q) => {
      const post = await loadPost(q, tenant, id, true);
      const old = await loadRevision(q, id, revisionId);
      const { rev } = await saveRevision(q, tenant, { post, data: old.data, actor: actorOf(req), request: req.info, note: `restored #${old.number}`, action: "blog.post.restore" });
      return { revisionId: rev.id, revision: rev.number };
    });
  });

  app.post("/v1/manage/blog/posts/:id/preview", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const { locale } = BLOG.preview.body.parse(req.body ?? {});
    await loadPost(db.q, tenant, id);
    const link = await previewLink(config, { sub: req.principal!.id, type: `blog.post:${id}`, locale });
    await auditNow(db, tenant, { action: "blog.post.preview", actor: actorOf(req), request: req.info, resource: { type: "blog_post", id, jti: link.jti } });
    return { url: link.url, expiresIn: link.expiresIn };
  });

  // ── Taxonomy ──
  app.get("/v1/manage/blog/taxonomy", { preHandler: op }, async () => {
    // Usage counts over the drafts, so an editor sees what a delete would affect.
    const counts = await db.q<{ category: string | null; tags: unknown; author: string | null }>(
      `SELECT r.data->>'categoryId' AS category, r.data->'tagIds' AS tags, r.data->>'authorId' AS author
         FROM blog_posts p JOIN blog_revisions r ON r.id = p.draft_revision_id WHERE p.tenant_id = $1 AND p.status <> 'archived'`,
      [tenant],
    );
    const n = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).length;
    const categories = await db.q<{ id: string; name: unknown; slug: unknown; description: unknown; position: number }>(`SELECT id, name, slug, description, position FROM blog_categories WHERE tenant_id = $1 ORDER BY position, created_at`, [tenant]);
    const tags = await db.q<{ id: string; name: unknown; slug: string }>(`SELECT id, name, slug FROM blog_tags WHERE tenant_id = $1 ORDER BY slug`, [tenant]);
    const authors = await db.q<{ id: string; slug: string; name: unknown; role: unknown; bio: unknown; expertise: unknown; photo: unknown; same_as: unknown; principal_id: string | null }>(`SELECT * FROM blog_authors WHERE tenant_id = $1 ORDER BY created_at`, [tenant]);
    return {
      categories: categories.map((c) => ({ id: c.id, name: asObj(c.name), slug: asObj(c.slug), description: asObj(c.description), position: c.position, posts: n((x) => x.category === c.id) })),
      tags: tags.map((t) => ({ id: t.id, name: asObj(t.name), slug: t.slug, posts: n((x) => asList(x.tags).includes(t.id)) })),
      authors: authors.map((a) => ({ id: a.id, slug: a.slug, name: asObj(a.name), role: asObj(a.role), bio: asObj(a.bio), expertise: asList(a.expertise), photo: a.photo ?? null, sameAs: asList(a.same_as), principalId: a.principal_id, posts: n((x) => x.author === a.id) })),
    };
  });

  /** Live posts that still point at a category, tag or author (so deleting it would leave a hole). */
  const liveUses = async (field: "categoryId" | "authorId" | "tagIds", id: string) => {
    const [r] = await db.q<{ n: number }>(
      field === "tagIds"
        ? `SELECT count(*)::int AS n FROM blog_posts p JOIN blog_revisions r ON r.id = p.published_revision_id WHERE p.tenant_id = $1 AND r.data->'tagIds' ? $2`
        : `SELECT count(*)::int AS n FROM blog_posts p JOIN blog_revisions r ON r.id = p.published_revision_id WHERE p.tenant_id = $1 AND (r.data->>'${field}' = $2 OR r.data->>'reviewerId' = $2)`,
      [tenant, id],
    );
    return r?.n ?? 0;
  };
  const slugCheck = async (table: "blog_tags" | "blog_authors", slug: string, except?: string) => {
    const [dup] = await db.q(`SELECT 1 FROM ${table} WHERE tenant_id = $1 AND slug = $2 ${except ? "AND id <> $3" : ""}`, except ? [tenant, slug, except] : [tenant, slug]);
    if (dup) throw conflict("SLUG_TAKEN", "The slug is in use");
  };
  const categorySlugCheck = async (slug: Record<string, string | undefined>, except?: string) => {
    for (const [l, s] of Object.entries(slug)) {
      if (!s) continue;
      const [dup] = await db.q(`SELECT 1 FROM blog_categories WHERE tenant_id = $1 AND slug->>$2 = $3 ${except ? "AND id <> $4" : ""}`, except ? [tenant, l, s, except] : [tenant, l, s]);
      if (dup) throw conflict("SLUG_TAKEN", `The ${l} slug is in use`);
    }
  };
  const write = async (req: FastifyRequest, action: string, resource: Record<string, unknown>, sql: string, params: unknown[]) =>
    db.tx(async (q) => {
      const rows = await q(sql, params);
      if (!sql.startsWith("INSERT") && !rows.length) throw notFound("Item");
      await audit(q, tenant, { action, actor: actorOf(req), request: req.info, resource });
      await notifySite(q, tenant, "blog.taxonomy", { action });
    });

  app.post("/v1/manage/blog/categories", { preHandler: op }, async (req) => {
    const b = CategoryBody.parse(req.body);
    await categorySlugCheck(b.slug);
    const id = ulid("bct_");
    await write(req, "blog.category.create", { type: "blog_category", id }, `INSERT INTO blog_categories (id, tenant_id, name, slug, description, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [id, tenant, JSON.stringify(b.name), JSON.stringify(b.slug), JSON.stringify(b.description), b.position]);
    return { id };
  });
  app.put("/v1/manage/blog/categories/:id", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const b = CategoryBody.parse(req.body);
    await categorySlugCheck(b.slug, id);
    await write(req, "blog.category.update", { type: "blog_category", id }, `UPDATE blog_categories SET name = $3, slug = $4, description = $5, position = $6, updated_at = clock_timestamp() WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant, JSON.stringify(b.name), JSON.stringify(b.slug), JSON.stringify(b.description), b.position]);
    return { ok: true };
  });
  app.post("/v1/manage/blog/tags", { preHandler: op }, async (req) => {
    const b = TagBody.parse(req.body);
    await slugCheck("blog_tags", b.slug);
    const id = ulid("btg_");
    await write(req, "blog.tag.create", { type: "blog_tag", id }, `INSERT INTO blog_tags (id, tenant_id, name, slug) VALUES ($1,$2,$3,$4) RETURNING id`, [id, tenant, JSON.stringify(b.name), b.slug]);
    return { id };
  });
  app.put("/v1/manage/blog/tags/:id", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const b = TagBody.parse(req.body);
    await slugCheck("blog_tags", b.slug, id);
    await write(req, "blog.tag.update", { type: "blog_tag", id }, `UPDATE blog_tags SET name = $3, slug = $4 WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant, JSON.stringify(b.name), b.slug]);
    return { ok: true };
  });
  app.post("/v1/manage/blog/authors", { preHandler: op }, async (req) => {
    const b = AuthorBody.parse(req.body);
    await slugCheck("blog_authors", b.slug);
    const id = ulid("bau_");
    await write(
      req,
      "blog.author.create",
      { type: "blog_author", id },
      `INSERT INTO blog_authors (id, tenant_id, slug, name, role, bio, expertise, photo, same_as, principal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [id, tenant, b.slug, JSON.stringify(b.name), JSON.stringify(b.role), JSON.stringify(b.bio), JSON.stringify(b.expertise), b.photo ? JSON.stringify(b.photo) : null, JSON.stringify(b.sameAs), b.principalId],
    );
    return { id };
  });
  app.put("/v1/manage/blog/authors/:id", { preHandler: op }, async (req) => {
    const id = idOf(req);
    const b = AuthorBody.parse(req.body);
    await slugCheck("blog_authors", b.slug, id);
    await write(
      req,
      "blog.author.update",
      { type: "blog_author", id },
      `UPDATE blog_authors SET slug = $3, name = $4, role = $5, bio = $6, expertise = $7, photo = $8, same_as = $9, principal_id = $10, updated_at = clock_timestamp() WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenant, b.slug, JSON.stringify(b.name), JSON.stringify(b.role), JSON.stringify(b.bio), JSON.stringify(b.expertise), b.photo ? JSON.stringify(b.photo) : null, JSON.stringify(b.sameAs), b.principalId],
    );
    return { ok: true };
  });
  for (const [path, table, field, kind] of [
    ["categories", "blog_categories", "categoryId", "category"],
    ["tags", "blog_tags", "tagIds", "tag"],
    ["authors", "blog_authors", "authorId", "author"],
  ] as const) {
    app.delete(`/v1/manage/blog/${path}/:id`, { preHandler: op }, async (req) => {
      const id = idOf(req);
      if (await liveUses(field, id)) throw conflict("IN_USE", "Live posts still use it; change them first");
      await write(req, `blog.${kind}.delete`, { type: `blog_${kind}`, id }, `DELETE FROM ${table} WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant]);
      return { ok: true };
    });
  }
}
