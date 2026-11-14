import type { FastifyInstance, FastifyRequest } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { bodyText, commentsOpen, isLive, LOCALES, parseInline, type BlogBlock, type BlogPostData, type Locale } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import type { Config } from "../config.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import type { Q } from "../db/index.ts";
import { badRequest, forbidden, notFound, Problem } from "../http/problem.ts";
import { safeEqual, sha256, token, ulid } from "../ids.ts";
import { BlogSettings } from "../settings/contract.ts";
import { loadSettings } from "../settings/service.ts";
import { enqueueEmail, pii } from "../tickets/service.ts";
import { BLOG_COMMUNITY, BLOG_EXTRA } from "./contract.ts";
import { card, taxonomy } from "./delivery.ts";
import { loadPost, loadRevision, notifySite } from "./service.ts";

type CommentRow = { id: string; post_id: string; locale: string; parent_id: string | null; name: string; email_enc: string | null; key_id: string | null; body: string; status: "pending" | "approved" | "spam" | "trash"; by_principal: string | null; created_at: Date };

/** Short strings for the newsletter emails (plain text; the site's own copy stays in OPEX content). */
const MAIL: Record<Locale, { confirmSubject: string; confirm: string; newPost: string; unsubscribe: string }> = {
  fa: { confirmSubject: "تأیید عضویت در خبرنامهٔ مجلهٔ آراپوش", confirm: "برای تأیید عضویت، این پیوند را باز کنید و دکمهٔ تأیید را بزنید:", newPost: "مقالهٔ تازه در مجلهٔ آراپوش", unsubscribe: "لغو عضویت" },
  en: { confirmSubject: "Confirm your Arapoush Journal subscription", confirm: "To confirm, open this link and press the button:", newPost: "New on the Arapoush Journal", unsubscribe: "Unsubscribe" },
  tr: { confirmSubject: "Arapoush Dergi aboneliğinizi onaylayın", confirm: "Onaylamak için bu bağlantıyı açıp düğmeye basın:", newPost: "Arapoush Dergi'de yeni", unsubscribe: "Abonelikten çık" },
};

export async function blogSettings(q: Q, tenant: string) {
  return (await loadSettings(q, tenant)).settings.blog;
}

/** Approved comments of a post in one language, one level of replies (the article and its JSON-LD). */
export async function publicComments(q: Q, postId: string, locale: string) {
  const rows = await q<CommentRow>(`SELECT * FROM blog_comments WHERE post_id = $1 AND locale = $2 AND status = 'approved' ORDER BY created_at`, [postId, locale]);
  const out = (r: CommentRow) => ({ id: r.id, name: r.name, body: r.body, team: !!r.by_principal, createdAt: new Date(r.created_at).toISOString() });
  return rows.filter((r) => !r.parent_id).map((r) => ({ ...out(r), replies: rows.filter((x) => x.parent_id === r.id).map(out) }));
}

/** Emails confirmed subscribers about a post's live translations, once (blog_posts.notified_at). */
export async function notifySubscribers(q: Q, config: Config, postId: string, data: BlogPostData) {
  const settings = await blogSettings(q, config.TENANT);
  if (!settings.enabled || !settings.sections.newsletter || !data.notifySubscribers) return 0;
  const [p] = await q<{ notified_at: Date | null }>(`SELECT notified_at FROM blog_posts WHERE id = $1`, [postId]);
  if (p?.notified_at) return 0;
  const keys = pii(config);
  const subs = await q<{ id: string; email_enc: string; key_id: string; locale: Locale; token_hash: string }>(`SELECT id, email_enc, key_id, locale, token_hash FROM blog_subscribers WHERE tenant_id = $1 AND status = 'confirmed'`, [config.TENANT]);
  let sent = 0;
  for (const s of subs) {
    const l = isLive(data.translations[s.locale]) ? s.locale : LOCALES.find((x) => isLive(data.translations[x]));
    if (!l) continue;
    const t = data.translations[l]!;
    const email = keys.decrypt<string>(s.id, s.key_id, s.email_enc);
    // A fresh unsubscribe token per mailing; the stored hash is replaced so older links stop working.
    const tok = token(24);
    await q(`UPDATE blog_subscribers SET token_hash = $2 WHERE id = $1`, [s.id, sha256(tok)]);
    const url = `${config.SITE_URL.replace(/\/$/, "")}/${l}/blog/${encodeURIComponent(t.slug)}`;
    const off = `${config.SITE_URL.replace(/\/$/, "")}/${l}/blog/newsletter?action=unsubscribe&token=${tok}`;
    await enqueueEmail(q, keys, config.TENANT, {
      kind: "newsletter",
      to: email,
      from: config.MAIL_FROM,
      subject: `${MAIL[l].newPost}: ${t.title}`.slice(0, 200),
      text: `${t.title}\n\n${t.excerpt}\n\n${url}\n\n--\n${MAIL[l].unsubscribe}: ${off}\n`,
    });
    sent++;
  }
  await q(`UPDATE blog_posts SET notified_at = clock_timestamp() WHERE id = $1`, [postId]);
  return sent;
}

/** Score live posts for a query: title and keywords weigh most, then summary, then body. */
function score(d: BlogPostData, l: Locale, terms: string[]) {
  const t = d.translations[l]!;
  const norm = (s: string) => s.toLowerCase().replace(/‌/g, " ");
  const fields: [string, number][] = [
    [norm(t.title), 6],
    [norm([t.seo.keyphrase ?? "", ...(t.keywords ?? [])].join(" ")), 5],
    [norm(t.excerpt), 3],
    [norm(t.keyTakeaways.join(" ")), 2],
    [norm(bodyText(t.body)), 1],
  ];
  return terms.reduce((sum, term) => sum + fields.reduce((s, [text, w]) => s + (text.includes(term) ? w : 0), 0), 0);
}

/** Blog extras: comments, newsletter, search, blog switches and AI translation drafts. */
export async function blogCommunityModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const op = requireOperator(deps);
  const keys = pii(config);
  const has = (req: FastifyRequest, p: string) => !!req.principal?.permissions?.has(p);
  const delivery = async (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw new Problem(401, "UNAUTHENTICATED", "Missing token");
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };
  // Per visitor, not per website server (the site calls from one address and asserts the visitor's IP).
  const visitorKey = (r: FastifyRequest) => {
    const auth = r.headers.authorization ?? "";
    const asserted = r.headers["x-end-user-ip"];
    return auth.startsWith("Bearer ") && safeEqual(auth.slice(7), config.DELIVERY_TOKEN) && typeof asserted === "string" && asserted.length < 64 ? `v:${asserted}` : r.ip;
  };
  const ipHash = (req: FastifyRequest) => {
    const ip = req.info.asserted_end_user_ip ?? null;
    return ip ? sha256(`${tenant}:comment-ip:${ip}`).slice(0, 32) : null;
  };

  // ── Comments (site) ──
  app.post("/v1/delivery/blog/comments", { preHandler: delivery, config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: visitorKey } } }, async (req) => {
    const b = BLOG_COMMUNITY.comment.body.parse(req.body);
    const s = await blogSettings(db.q, tenant);
    const [p] = await db.q<{ id: string; first_published_at: Date | null; data: BlogPostData }>(
      `SELECT p.id, p.first_published_at, r.data FROM blog_posts p JOIN blog_revisions r ON r.id = p.published_revision_id WHERE p.id = $1 AND p.tenant_id = $2 AND p.status = 'published'`,
      [b.postId, tenant],
    );
    if (!p || !isLive(p.data.translations[b.locale])) throw notFound("Post");
    if (!commentsOpen(s, p.data, p.first_published_at)) throw forbidden("COMMENTS_CLOSED", "Comments are closed");
    const links = parseInline(b.body).filter((x) => x.t === "a").length + (b.body.match(/https?:\/\/|www\./gi) ?? []).length;
    if (links > s.comments.maxLinks) throw badRequest("TOO_MANY_LINKS", "Too many links");
    if (s.comments.requireEmail && !b.email) throw badRequest("EMAIL_REQUIRED", "Email is required");
    const ih = ipHash(req);
    if (ih) {
      const [{ n }] = (await db.q<{ n: number }>(`SELECT count(*)::int AS n FROM blog_comments WHERE tenant_id = $1 AND ip_hash = $2 AND created_at > clock_timestamp() - interval '10 minutes'`, [tenant, ih])) as [{ n: number }];
      if (n >= 5) throw new Problem(429, "TOO_MANY_COMMENTS", "Too many comments from this address; try again later");
    }
    let parent: string | null = null;
    if (b.parentId) {
      const [pa] = await db.q<{ id: string; parent_id: string | null }>(`SELECT id, parent_id FROM blog_comments WHERE id = $1 AND post_id = $2 AND status = 'approved'`, [b.parentId, b.postId]);
      parent = pa ? (pa.parent_id ?? pa.id) : null; // one level of replies
    }
    const emailHash = b.email ? keys.hashEmail(b.email) : null;
    let status: "pending" | "approved" = "pending";
    if (s.comments.moderation === "none") status = "approved";
    else if (s.comments.moderation === "known" && emailHash) {
      const [known] = await db.q(`SELECT 1 FROM blog_comments WHERE tenant_id = $1 AND email_hash = $2 AND status = 'approved' LIMIT 1`, [tenant, emailHash]);
      if (known) status = "approved";
    }
    const id = ulid("bcm_");
    const enc = b.email ? keys.encrypt(id, b.email.trim().toLowerCase()) : null;
    await db.tx(async (q) => {
      await q(
        `INSERT INTO blog_comments (id, tenant_id, post_id, locale, parent_id, name, email_hash, email_enc, key_id, body, status, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, tenant, b.postId, b.locale, parent, b.name, emailHash, enc?.payload ?? null, enc?.keyId ?? null, b.body, status, ih],
      );
      if (status === "approved") await notifySite(q, tenant, "blog.comment", { post: b.postId });
    });
    return { status };
  });

  // ── Comments (console) ──
  app.get("/v1/manage/blog/comments", { preHandler: op }, async (req) => {
    const { status, post } = BLOG_EXTRA.comments.query.parse(req.query);
    const rows = await db.q<CommentRow & { draft: BlogPostData | null }>(
      `SELECT c.*, r.data AS draft FROM blog_comments c JOIN blog_posts p ON p.id = c.post_id LEFT JOIN blog_revisions r ON r.id = p.draft_revision_id
        WHERE c.tenant_id = $1 ${status ? "AND c.status = $2" : "AND c.status <> 'trash'"} ${post ? `AND c.post_id = $${status ? 3 : 2}` : ""}
        ORDER BY c.created_at DESC LIMIT 300`,
      [tenant, ...(status ? [status] : []), ...(post ? [post] : [])],
    );
    const [{ n }] = (await db.q<{ n: number }>(`SELECT count(*)::int AS n FROM blog_comments WHERE tenant_id = $1 AND status = 'pending'`, [tenant])) as [{ n: number }];
    return {
      pending: n,
      items: rows.map((r) => ({
        id: r.id,
        postId: r.post_id,
        postTitle: r.draft?.translations[r.locale as Locale]?.title ?? r.draft?.translations.fa?.title ?? "",
        locale: r.locale,
        parentId: r.parent_id,
        name: r.name,
        email: r.email_enc && r.key_id ? keys.decrypt<string>(r.id, r.key_id, r.email_enc) : null,
        body: r.body,
        status: r.status,
        team: !!r.by_principal,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  });

  const commentOf = async (q: Q, id: string) => {
    const [c] = await q<CommentRow>(`SELECT * FROM blog_comments WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!c) throw notFound("Comment");
    return c;
  };
  app.post("/v1/manage/blog/comments/:id/moderate", { preHandler: op }, async (req) => {
    const { id } = BLOG_EXTRA.moderate.params.parse(req.params);
    const { status } = BLOG_EXTRA.moderate.body.parse(req.body);
    await db.tx(async (q) => {
      const c = await commentOf(q, id);
      await q(`UPDATE blog_comments SET status = $2, moderated_at = clock_timestamp(), moderated_by = $3 WHERE id = $1`, [id, status, req.principal!.id]);
      await audit(q, tenant, { action: "blog.comment.moderate", actor: actorOf(req), request: req.info, resource: { type: "blog_comment", id, post: c.post_id, from: c.status, to: status } });
      if (c.status === "approved" || status === "approved") await notifySite(q, tenant, "blog.comment", { post: c.post_id });
    });
    return { ok: true };
  });
  app.post("/v1/manage/blog/comments/:id/reply", { preHandler: op }, async (req) => {
    const { id } = BLOG_EXTRA.reply.params.parse(req.params);
    const { body } = BLOG_EXTRA.reply.body.parse(req.body);
    const rid = ulid("bcm_");
    await db.tx(async (q) => {
      const c = await commentOf(q, id);
      // Answering a comment approves it: a reply under a hidden comment would be orphaned.
      if (c.status !== "approved") await q(`UPDATE blog_comments SET status = 'approved', moderated_at = clock_timestamp(), moderated_by = $2 WHERE id = $1`, [id, req.principal!.id]);
      await q(`INSERT INTO blog_comments (id, tenant_id, post_id, locale, parent_id, name, body, status, by_principal) VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',$8)`, [
        rid,
        tenant,
        c.post_id,
        c.locale,
        c.parent_id ?? c.id,
        req.principal!.display,
        body,
        req.principal!.id,
      ]);
      await audit(q, tenant, { action: "blog.comment.reply", actor: actorOf(req), request: req.info, resource: { type: "blog_comment", id: rid, parent: id, post: c.post_id } });
      await notifySite(q, tenant, "blog.comment", { post: c.post_id });
    });
    return { id: rid };
  });
  app.delete("/v1/manage/blog/comments/:id", { preHandler: op }, async (req) => {
    const { id } = BLOG_EXTRA.deleteComment.params.parse(req.params);
    await db.tx(async (q) => {
      const c = await commentOf(q, id);
      await q(`DELETE FROM blog_comments WHERE id = $1`, [id]);
      await audit(q, tenant, { action: "blog.comment.delete", actor: actorOf(req), request: req.info, resource: { type: "blog_comment", id, post: c.post_id } });
      if (c.status === "approved") await notifySite(q, tenant, "blog.comment", { post: c.post_id });
    });
    return { ok: true };
  });

  // ── Newsletter (site) ──
  app.post("/v1/delivery/blog/subscribe", { preHandler: delivery, config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: visitorKey } } }, async (req) => {
    const { email, locale } = BLOG_COMMUNITY.subscribe.body.parse(req.body);
    const s = await blogSettings(db.q, tenant);
    if (!s.enabled || !s.sections.newsletter) throw forbidden("NEWSLETTER_OFF", "The newsletter is off");
    const addr = email.trim().toLowerCase();
    const h = keys.hashEmail(addr);
    const tok = token(24);
    await db.tx(async (q) => {
      const [ex] = await q<{ id: string; status: string }>(`SELECT id, status FROM blog_subscribers WHERE tenant_id = $1 AND email_hash = $2`, [tenant, h]);
      // Already confirmed: nothing to do (and nothing that tells a stranger the address is subscribed).
      if (ex?.status === "confirmed") return;
      const id = ex?.id ?? ulid("bsb_");
      const enc = keys.encrypt(id, addr);
      if (ex) await q(`UPDATE blog_subscribers SET status = 'pending', token_hash = $2, locale = $3, email_enc = $4, key_id = $5 WHERE id = $1`, [id, sha256(tok), locale, enc.payload, enc.keyId]);
      else await q(`INSERT INTO blog_subscribers (id, tenant_id, email_hash, email_enc, key_id, locale, token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, tenant, h, enc.payload, enc.keyId, locale, sha256(tok)]);
      const url = `${config.SITE_URL.replace(/\/$/, "")}/${locale}/blog/newsletter?action=confirm&token=${tok}`;
      await enqueueEmail(q, keys, tenant, { kind: "newsletter-confirm", to: addr, from: config.MAIL_FROM, subject: MAIL[locale].confirmSubject, text: `${MAIL[locale].confirm}\n\n${url}\n` });
    });
    return { ok: true };
  });
  app.post("/v1/delivery/blog/newsletter", { preHandler: delivery, config: { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: visitorKey } } }, async (req) => {
    const { token: tok, action } = BLOG_COMMUNITY.newsletter.body.parse(req.body);
    const [s] = await db.q<{ id: string }>(`SELECT id FROM blog_subscribers WHERE tenant_id = $1 AND token_hash = $2`, [tenant, sha256(tok)]);
    if (!s) throw notFound("Subscription");
    if (action === "confirm") await db.q(`UPDATE blog_subscribers SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, clock_timestamp()), unsubscribed_at = NULL WHERE id = $1`, [s.id]);
    else await db.q(`UPDATE blog_subscribers SET status = 'unsubscribed', unsubscribed_at = clock_timestamp() WHERE id = $1`, [s.id]);
    return { ok: true as const, status: action === "confirm" ? ("confirmed" as const) : ("unsubscribed" as const) };
  });

  // ── Newsletter (console) ──
  app.get("/v1/manage/blog/subscribers", { preHandler: op }, async () => {
    const rows = await db.q<{ id: string; email_enc: string; key_id: string; locale: string; status: "pending" | "confirmed" | "unsubscribed"; created_at: Date; confirmed_at: Date | null }>(
      `SELECT id, email_enc, key_id, locale, status, created_at, confirmed_at FROM blog_subscribers WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`,
      [tenant],
    );
    return {
      confirmed: rows.filter((r) => r.status === "confirmed").length,
      items: rows.map((r) => ({ id: r.id, email: keys.decrypt<string>(r.id, r.key_id, r.email_enc), locale: r.locale, status: r.status, createdAt: new Date(r.created_at).toISOString(), confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null })),
    };
  });
  app.delete("/v1/manage/blog/subscribers/:id", { preHandler: op }, async (req) => {
    const { id } = BLOG_EXTRA.deleteSubscriber.params.parse(req.params);
    const rows = await db.q(`DELETE FROM blog_subscribers WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant]);
    if (!rows.length) throw notFound("Subscriber");
    await auditNow(db, tenant, { action: "blog.subscriber.delete", actor: actorOf(req), request: req.info, resource: { type: "blog_subscriber", id } });
    return { ok: true };
  });

  // ── Search (site) ──
  app.get("/v1/delivery/blog/search", { preHandler: delivery, config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { locale, q } = BLOG_COMMUNITY.search.query.parse(req.query);
    const terms = q.toLowerCase().replace(/‌/g, " ").split(/\s+/).filter((x) => x.length > 1).slice(0, 8);
    const [posts, tax] = await Promise.all([
      db.q<{ id: string; first_published_at: Date; published_at: Date; data: BlogPostData }>(
        `SELECT p.id, p.first_published_at, p.published_at, r.data FROM blog_posts p JOIN blog_revisions r ON r.id = p.published_revision_id WHERE p.tenant_id = $1 AND p.status = 'published'`,
        [tenant],
      ),
      taxonomy(db.q, tenant),
    ]);
    reply.header("Cache-Control", "private, max-age=0, s-maxage=60");
    return {
      items: posts
        .filter((p) => isLive(p.data.translations[locale]) && !p.data.translations[locale]!.seo.noindex)
        .map((p) => ({ p, s: score(p.data, locale, terms) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 30)
        .map((x) => card(x.p, locale, tax)),
    };
  });

  // ── Blog switches (console) ──
  app.get("/v1/manage/blog/settings", { preHandler: op }, async () => ({ settings: await blogSettings(db.q, tenant), env: { mail: !!config.SMTP_URL, ai: !!config.ANTHROPIC_API_KEY } }));
  app.put("/v1/manage/blog/settings", { preHandler: op }, async (req) => {
    const data = BlogSettings.parse(req.body ?? {});
    await db.tx(async (q) => {
      const [before] = await q<{ data: unknown }>(`SELECT data FROM site_settings WHERE tenant_id = $1 AND section = 'blog'`, [tenant]);
      await q(
        `INSERT INTO site_settings (tenant_id, section, data, updated_by) VALUES ($1,'blog',$2::jsonb,$3)
         ON CONFLICT (tenant_id, section) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = clock_timestamp()`,
        [tenant, JSON.stringify(data), req.principal!.id],
      );
      await audit(q, tenant, { action: "blog.settings.update", actor: actorOf(req), request: req.info, resource: { type: "settings", id: "blog" }, changes: [{ op: "replace", path: "/blog", old: before?.data ?? null, new: data }] });
      await notifySite(q, tenant, "content.published", { type: "settings", section: "blog" });
    });
    return { ok: true };
  });

  // ── AI translation draft (console) ──
  const Segments = z.object({ segments: z.array(z.object({ key: z.string(), text: z.string() })) });
  app.post("/v1/manage/blog/posts/:id/translate", { preHandler: op, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = BLOG_EXTRA.translate.params.parse(req.params);
    const { from, to } = BLOG_EXTRA.translate.body.parse(req.body);
    if (!config.ANTHROPIC_API_KEY) throw new Problem(503, "AI_OFF", "AI translation is not configured (ANTHROPIC_API_KEY)");
    const post = await loadPost(db.q, tenant, id);
    if (post.created_by !== req.principal!.id && !has(req, "blog.edit_others")) throw forbidden("NOT_YOUR_POST", "This post was written by someone else");
    const rev = post.draft_revision_id ? await loadRevision(db.q, id, post.draft_revision_id) : null;
    const src = rev?.data.translations[from];
    if (!src || !src.title) throw notFound("Source translation");
    const segs = toSegments(src);
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
    const NAMES: Record<Locale, string> = { fa: "Persian (Farsi)", en: "English", tr: "Turkish" };
    let out: z.infer<typeof Segments> | null = null;
    try {
      const res = await client.beta.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        // A refused request is retried on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(Segments) },
        system:
          "You translate articles of Arapoush, a manufacturer of multi-layer plastic tubes and effervescent tablet tubes (packaging for cosmetics, pharma, hygiene and food). " +
          "Translate each segment faithfully and naturally for search readers in the target language, using the industry's usual terms. " +
          "Keep the inline markup exactly: **bold**, *italic*, [link text](url) - translate the link text, never the url. Keep numbers, units and brand names. " +
          "Return every segment with its key unchanged.",
        messages: [{ role: "user", content: `Translate from ${NAMES[from]} to ${NAMES[to]}.\n\n${JSON.stringify({ segments: segs })}` }],
      });
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(res.stop_reason);
      out = res.parsed_output;
    } catch (e) {
      req.log.warn({ err: e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message }, "blog translation failed");
      throw new Problem(502, "AI_FAILED", "The translation service did not answer; try again");
    }
    if (!out) throw new Problem(502, "AI_FAILED", "The translation came back incomplete; try again");
    await auditNow(db, tenant, { action: "blog.post.translate", actor: actorOf(req), request: req.info, resource: { type: "blog_post", id, from, to, segments: segs.length } });
    return fromSegments(src, new Map(out.segments.map((s) => [s.key, s.text])));
  });
}

type Tr = NonNullable<BlogPostData["translations"]["fa"]>;
/** Every translatable string of a translation as key → text (links, images and kinds stay out). */
function toSegments(t: Tr) {
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
function fromSegments(t: Tr, m: Map<string, string>) {
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
