import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  applyTranslations,
  contentType,
  coverage,
  emptyTranslation,
  LOCALE_INFO,
  LOCALES,
  localizedLeaves,
  needsTranslation,
  slugify,
  type BlogPostData,
  type Locale,
  type Localized,
  type TranslateMode,
} from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import type { Q } from "../db/index.ts";
import { badRequest, forbidden, notFound } from "../http/problem.ts";
import { getEntry, getRevision, saveDraft } from "../content/service.ts";
import { recheckOpen } from "../cr/service.ts";
import { loadPost, loadRevision, notifySite, saveRevision } from "../blog/service.ts";
import { PostData } from "../blog/contract.ts";
import { translate, type Seg } from "./ai.ts";
import { fromSegments, toSegments, type Tr } from "./blog.ts";
import { TRANSLATE } from "./contract.ts";

type Job = { from: Locale; to: Locale[]; mode: TranslateMode; note?: string; dryRun: boolean };
const perLocale = (to: Locale[], f: (l: Locale) => number) => Object.fromEntries(to.map((l) => [l, f(l)]));
const hasText = (v: Localized | undefined, l: Locale) => typeof v?.[l] === "string" && v[l]!.trim() !== "";

function checkJob(j: Job): Job {
  if (j.to.includes(j.from)) throw badRequest("SAME_LANGUAGE", "A target language is the source language");
  return { ...j, to: [...new Set(j.to)] };
}

/** AI translation across the site (pages, sections, blog posts, blog lists), always into drafts. */
export async function translateModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const read = requireOperator(deps, "viewer");
  const write = requireOperator(deps, "operator");
  const has = (req: FastifyRequest, p: string) => !!req.principal?.permissions?.has(p);
  const limited = { rateLimit: { max: 30, timeWindow: "1 minute" } };

  // ── Overview: what exists and how complete each language is ──
  app.get("/v1/manage/translate", { preHandler: read }, async (req) => {
    const rows = await db.q<{ type_key: string; data: unknown; draft_revision_id: string | null; published_revision_id: string | null }>(
      `SELECT e.type_key, r.data, e.draft_revision_id, e.published_revision_id FROM entries e JOIN revisions r ON r.id = e.draft_revision_id WHERE e.tenant_id = $1 ORDER BY e.type_key`,
      [tenant],
    );
    const entries = rows.flatMap((r) => {
      const t = contentType(r.type_key);
      if (!t) return [];
      const c = coverage(t.schema, r.data);
      return c.total ? [{ type: r.type_key, label: t.label, total: c.total, filled: c.filled, unpublished: r.draft_revision_id !== r.published_revision_id }] : [];
    });
    let posts: { id: string; title: string; status: string; locales: Locale[] }[] = [];
    let taxonomy = { total: 0, filled: perLocale([...LOCALES], () => 0) };
    if (has(req, "blog.read")) {
      const ps = await db.q<{ id: string; status: string; data: BlogPostData | null }>(
        `SELECT p.id, p.status, r.data FROM blog_posts p LEFT JOIN blog_revisions r ON r.id = p.draft_revision_id WHERE p.tenant_id = $1 AND p.status <> 'archived' ORDER BY p.updated_at DESC LIMIT 500`,
        [tenant],
      );
      posts = ps.map((p) => {
        const tr = p.data?.translations ?? {};
        const locales = LOCALES.filter((l) => !!tr[l]?.title.trim() && (tr[l]?.body.length ?? 0) > 0);
        const title = LOCALES.map((l) => tr[l]?.title).find((x) => x?.trim()) ?? "";
        return { id: p.id, title, status: p.status, locales };
      });
      const values = (await taxonomyValues(db.q, tenant)).map((v) => v.value);
      const withText = values.filter((v) => LOCALES.some((l) => hasText(v, l)));
      taxonomy = { total: withText.length, filled: perLocale([...LOCALES], (l) => withText.filter((v) => hasText(v, l)).length) };
    }
    return {
      ai: !!config.ANTHROPIC_API_KEY,
      locales: LOCALES.map((code) => ({ code, ...LOCALE_INFO[code] })),
      entries,
      posts,
      taxonomy,
    };
  });

  // ── A page, a global, or one section of it ──
  app.post("/v1/manage/translate/entries/:type", { preHandler: write, config: limited }, async (req) => {
    const { type } = TRANSLATE.entry.params.parse(req.params);
    const body = TRANSLATE.entry.body.parse(req.body);
    const job = checkJob(body);
    const t = contentType(type);
    if (!t) throw notFound("Content type");
    const e = await getEntry(db.q, tenant, type);
    const data = e.draft_revision_id ? (await getRevision(db.q, e.draft_revision_id)).data : {};
    const leaves = localizedLeaves(t.schema, data, body.scope);
    const targets = job.to.map((to) => ({
      to,
      segments: leaves.filter((l) => needsTranslation(l.value, job.from, to, job.mode)).map((l): Seg => ({ key: l.path, text: l.value[job.from]!, max: l.max })),
    }));
    const segments = targets.reduce((n, x) => n + x.segments.length, 0);
    if (job.dryRun || !segments) return { segments, written: 0, perLocale: perLocale(job.to, () => 0), revision: null };

    const out = await translate(config, req.log, { from: job.from, targets, note: job.note });
    const done = new Map<string, { source: string; out: Partial<Record<Locale, string>> }>();
    for (const l of leaves) {
      const o: Partial<Record<Locale, string>> = {};
      for (const to of job.to) {
        const s = out.get(to)?.get(l.path);
        if (s !== undefined) o[to] = s;
      }
      if (Object.keys(o).length) done.set(l.path, { source: l.value[job.from]!, out: o });
    }
    const counts = perLocale(job.to, (to) => [...done.values()].filter((d) => d.out[to] !== undefined).length);

    return db.tx(async (q) => {
      // The draft may have moved on while the AI worked: apply onto the newest one (only where the source text is unchanged).
      const cur = await getEntry(q, tenant, type, "main", true);
      const latest = cur.draft_revision_id ? (await getRevision(q, cur.draft_revision_id)).data : {};
      const applied = applyTranslations(t.schema, latest, job.from, done);
      const note = `AI translation ${job.from} → ${job.to.join(", ")}${body.scope ? ` (${body.scope})` : ""}`;
      await audit(q, tenant, { action: "content.translate", actor: actorOf(req), request: req.info, resource: { type: "entry", id: cur.id, entry: type, from: job.from, to: job.to, mode: job.mode, scope: body.scope ?? null, segments, written: applied.written } });
      if (!applied.written) return { segments, written: 0, perLocale: perLocale(job.to, () => 0), revision: null };
      const { revision, changes } = await saveDraft(q, tenant, { typeKey: type, data: applied.data, baseRevisionId: cur.draft_revision_id, actor: actorOf(req), request: req.info, note });
      if (changes.length) await recheckOpen(q, tenant, type, { actor: actorOf(req), request: req.info });
      return { segments, written: applied.written, perLocale: counts, revision: changes.length ? { id: revision.id, number: revision.number } : null };
    });
  });

  // ── A blog post ──
  app.post("/v1/manage/translate/blog/:id", { preHandler: write, config: limited }, async (req) => {
    const { id } = TRANSLATE.post.params.parse(req.params);
    const body = TRANSLATE.post.body.parse(req.body);
    const job = checkJob(body);
    const post = await loadPost(db.q, tenant, id);
    if (post.created_by !== req.principal!.id && !has(req, "blog.edit_others")) throw forbidden("NOT_YOUR_POST", "This post was written by someone else");
    const rev = post.draft_revision_id ? await loadRevision(db.q, id, post.draft_revision_id) : null;
    const src = rev?.data.translations[job.from];
    if (!rev || !src || !src.title.trim()) throw notFound("Source translation");

    const all = toSegments(src);
    const plans = job.to.map((to) => {
      const tgt = rev.data.translations[to];
      const full = job.mode === "all" || isBlank(tgt);
      const groups = new Set(full ? GROUPS : GROUPS.filter((g) => groupEmpty(tgt!, g)));
      return { to, full, groups, segments: all.filter((s) => groups.has(groupOf(s.key))) };
    });
    const segments = plans.reduce((n, p) => n + p.segments.length, 0);
    if (job.dryRun || !segments) return { segments, written: 0, perLocale: perLocale(job.to, () => 0), revisionId: null };

    const out = await translate(config, req.log, { from: job.from, targets: plans.map((p) => ({ to: p.to, segments: p.segments })), note: job.note });

    return db.tx(async (q) => {
      const locked = await loadPost(q, tenant, id, true);
      const base = locked.draft_revision_id ? (await loadRevision(q, id, locked.draft_revision_id)).data : rev.data;
      const data: BlogPostData = structuredClone(base);
      const written: Record<string, number> = {};
      for (const p of plans) {
        const m = out.get(p.to)!;
        written[p.to] = m.size;
        if (!m.size) continue;
        const tr = fromSegments(src, m);
        data.translations[p.to] = await merge(q, id, p.to, data.translations[p.to], src, tr, p.groups, p.full, body.enable);
      }
      const total = Object.values(written).reduce((a, b) => a + b, 0);
      if (!total) return { segments, written: 0, perLocale: written, revisionId: null };
      const valid = PostData.parse(data) as BlogPostData;
      const { rev: saved, changed } = await saveRevision(q, tenant, { post: locked, data: valid, actor: actorOf(req), request: req.info, note: `AI translation ${job.from} → ${job.to.join(", ")}`, action: "blog.post.translate" });
      return { segments, written: total, perLocale: written, revisionId: changed ? saved.id : null };
    });
  });

  /** A slug for a new translation that no other post uses. */
  async function freeSlug(q: Q, postId: string, l: Locale, title: string) {
    const s = slugify(title).slice(0, 90) || postId.slice(-8).toLowerCase();
    const [other] = await q(`SELECT 1 FROM blog_slugs WHERE tenant_id = $1 AND locale = $2 AND slug = $3 AND post_id <> $4`, [tenant, l, s, postId]);
    return other ? `${s}-${postId.slice(-4).toLowerCase()}` : s;
  }

  async function merge(q: Q, postId: string, l: Locale, tgt: Tr | undefined, src: Tr, tr: ReturnType<typeof fromSegments>, groups: Set<Group>, full: boolean, enable: boolean): Promise<Tr> {
    const base: Tr = tgt ? structuredClone(tgt) : { ...emptyTranslation(), enabled: enable };
    const seo = { ...base.seo };
    if (groups.has("title")) base.title = tr.title;
    if (groups.has("excerpt")) base.excerpt = tr.excerpt;
    if (groups.has("body")) base.body = tr.body;
    if (groups.has("takeaways")) base.keyTakeaways = tr.keyTakeaways;
    if (groups.has("faq")) base.faq = tr.faq;
    if (groups.has("keywords")) base.keywords = tr.keywords;
    if (groups.has("seo.title") && tr.seo.title) seo.title = tr.seo.title;
    if (groups.has("seo.description") && tr.seo.description) seo.description = tr.seo.description;
    if (groups.has("seo.keyphrase") && tr.seo.keyphrase) seo.keyphrase = tr.seo.keyphrase;
    if (full) {
      if (src.seo.ogImage && !seo.ogImage) seo.ogImage = src.seo.ogImage;
      if (src.seo.noindex !== undefined && seo.noindex === undefined) seo.noindex = src.seo.noindex;
    }
    base.seo = seo;
    if (!base.sources.length) base.sources = structuredClone(src.sources);
    if (!base.slug && base.title.trim()) base.slug = await freeSlug(q, postId, l, base.title);
    if (!tgt) base.enabled = enable;
    return base;
  }

  // ── Blog categories, tags and authors ──
  app.post("/v1/manage/translate/blog-taxonomy", { preHandler: write, config: limited }, async (req) => {
    const job = checkJob(TRANSLATE.taxonomy.body.parse(req.body));
    const values = await taxonomyValues(db.q, tenant);
    const targets = job.to.map((to) => ({
      to,
      segments: values.filter((v) => needsTranslation(v.value, job.from, to, job.mode)).map((v): Seg => ({ key: v.key, text: v.value[job.from]!, max: v.max })),
    }));
    const segments = targets.reduce((n, x) => n + x.segments.length, 0);
    if (job.dryRun || !segments) return { segments, written: 0, perLocale: perLocale(job.to, () => 0) };
    const out = await translate(config, req.log, { from: job.from, targets, note: job.note });

    return db.tx(async (q) => {
      const fresh = await taxonomyValues(q, tenant);
      const written = perLocale(job.to, () => 0);
      const rows = new Map<string, { table: string; id: string; cols: Record<string, Localized> }>();
      for (const v of fresh) {
        const asked = values.find((x) => x.key === v.key);
        if (!asked || asked.value[job.from] !== v.value[job.from]) continue; // changed meanwhile
        const next: Localized = { ...v.value };
        let changed = false;
        for (const to of job.to) {
          const s = out.get(to)?.get(v.key);
          if (s === undefined || s.length > v.max) continue;
          next[to] = s;
          written[to]!++;
          changed = true;
        }
        if (!changed) continue;
        const r = rows.get(`${v.table}:${v.id}`) ?? { table: v.table, id: v.id, cols: {} };
        r.cols[v.col] = next;
        rows.set(`${v.table}:${v.id}`, r);
      }
      for (const r of rows.values()) {
        const cols = Object.keys(r.cols);
        const params: unknown[] = [r.id, tenant, ...cols.map((c) => JSON.stringify(r.cols[c]))];
        await q(`UPDATE ${r.table} SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}${r.table === "blog_tags" ? "" : ", updated_at = clock_timestamp()"} WHERE id = $1 AND tenant_id = $2`, params);
        // Categories: a target without a slug gets one from its new name (when no other category has it).
        if (r.table === "blog_categories" && r.cols.name) {
          const [row] = await q<{ slug: Record<string, string> }>(`SELECT slug FROM blog_categories WHERE id = $1`, [r.id]);
          const slug = { ...(row?.slug ?? {}) };
          for (const to of job.to) {
            const name = r.cols.name[to];
            if (slug[to] || !name) continue;
            const s = slugify(name).slice(0, 90);
            const [dup] = await q(`SELECT 1 FROM blog_categories WHERE tenant_id = $1 AND slug->>$2 = $3 AND id <> $4`, [tenant, to, s, r.id]);
            if (s && !dup) slug[to] = s;
          }
          await q(`UPDATE blog_categories SET slug = $2 WHERE id = $1`, [r.id, JSON.stringify(slug)]);
        }
      }
      const total = Object.values(written).reduce((a, b) => a + b, 0);
      await audit(q, tenant, { action: "blog.taxonomy.translate", actor: actorOf(req), request: req.info, resource: { type: "blog_taxonomy", from: job.from, to: job.to, mode: job.mode, segments, written: total, items: rows.size } });
      if (rows.size) await notifySite(q, tenant, "blog.taxonomy", { action: "translate" });
      return { segments, written: total, perLocale: written };
    });
  });
}

// ── Blog post parts: a target's empty parts are filled in mode "missing" ──
const GROUPS = ["title", "excerpt", "seo.title", "seo.description", "seo.keyphrase", "keywords", "takeaways", "faq", "body"] as const;
type Group = (typeof GROUPS)[number];
const groupOf = (key: string) => (key.startsWith("seo.") ? key : key.split(".")[0]) as Group;
const isBlank = (t: Tr | undefined) => !t || (!t.title.trim() && t.body.length === 0);
function groupEmpty(t: Tr, g: Group) {
  switch (g) {
    case "title":
      return !t.title.trim();
    case "excerpt":
      return !t.excerpt.trim();
    case "seo.title":
      return !t.seo.title?.trim();
    case "seo.description":
      return !t.seo.description?.trim();
    case "seo.keyphrase":
      return !t.seo.keyphrase?.trim();
    case "keywords":
      return !t.keywords?.length;
    case "takeaways":
      return !t.keyTakeaways.length;
    case "faq":
      return !t.faq.length;
    case "body":
      return !t.body.length;
  }
}

/** Every localized value of the blog lists, keyed `table:id:column`, with its length limit. */
async function taxonomyValues(q: Q, tenant: string) {
  const asLoc = (v: unknown): Localized => (v && typeof v === "object" && !Array.isArray(v) ? (v as Localized) : {});
  const out: { key: string; table: string; id: string; col: string; value: Localized; max: number }[] = [];
  const add = (table: string, id: string, col: string, v: unknown, max: number) => out.push({ key: `${table}:${id}:${col}`, table, id, col, value: asLoc(v), max });
  for (const c of await q<{ id: string; name: unknown; description: unknown }>(`SELECT id, name, description FROM blog_categories WHERE tenant_id = $1`, [tenant])) (add("blog_categories", c.id, "name", c.name, 80), add("blog_categories", c.id, "description", c.description, 300));
  for (const t of await q<{ id: string; name: unknown }>(`SELECT id, name FROM blog_tags WHERE tenant_id = $1`, [tenant])) add("blog_tags", t.id, "name", t.name, 60);
  for (const a of await q<{ id: string; name: unknown; role: unknown; bio: unknown }>(`SELECT id, name, role, bio FROM blog_authors WHERE tenant_id = $1`, [tenant])) (add("blog_authors", a.id, "name", a.name, 120), add("blog_authors", a.id, "role", a.role, 120), add("blog_authors", a.id, "bio", a.bio, 1500));
  return out;
}
