import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTranslation, type BlogPostData } from "@arapoush/schema";
import { testApp, signIn, as, type Operator } from "../testing.ts";
import { pii } from "../tickets/service.ts";

const tr = (title: string, slug: string, extra: Partial<ReturnType<typeof emptyTranslation>> = {}) => ({
  ...emptyTranslation(),
  enabled: true,
  title,
  slug,
  excerpt: "خلاصه",
  body: [{ id: "p", kind: "p" as const, text: `متن دربارهٔ ${title}` }],
  ...extra,
});

test("blog community: switches, moderated comments, newsletter double opt-in, search, AI switch", async () => {
  const t = await testApp({ SMTP_URL: "smtp://localhost:2525" });
  try {
    const admin = await signIn(t.app, t);
    const writer = await signIn(t.app, t, "blog_author");
    const req = (op: Operator, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as "GET", url, headers: as(op), payload: payload as object });
    const site = (method: string, url: string, payload?: unknown, ip = "203.0.113.7") =>
      t.app.inject({ method: method as "GET", url, headers: { authorization: `Bearer ${t.config.DELIVERY_TOKEN}`, "x-end-user-ip": ip }, payload: payload as object });

    // Settings: authors read them, only managers change them.
    const s0 = (await req(writer, "GET", "/v1/manage/blog/settings")).json();
    assert.equal(s0.settings.sections.comments, true);
    assert.equal(s0.env.ai, false);
    assert.equal((await req(writer, "PUT", "/v1/manage/blog/settings", s0.settings)).statusCode, 403);

    // A published post with two keywords; a second one for search.
    const mk = async (data: BlogPostData) => {
      const c = (await req(admin, "POST", "/v1/manage/blog/posts", {})).json();
      const s = await req(admin, "PUT", `/v1/manage/blog/posts/${c.id}`, { data, baseRevisionId: c.revisionId });
      assert.equal(s.statusCode, 200, s.body);
      assert.equal((await req(admin, "POST", `/v1/manage/blog/posts/${c.id}/publish`, {})).statusCode, 200);
      return c.id as string;
    };
    const base: BlogPostData = { categoryId: null, tagIds: [], authorId: null, reviewerId: null, cover: null, featured: false, products: [], relatedIds: [], translations: {} };
    const id = await mk({ ...base, translations: { fa: tr("تیوب چندلایه", "tube", { keywords: ["لایه مانع", "EVOH"] }) } });
    await mk({ ...base, translations: { fa: tr("چاپ روی تیوب", "print") } });

    // Comments wait for approval by default; links over the limit and missing emails are refused.
    const c1 = await site("POST", "/v1/delivery/blog/comments", { postId: id, locale: "fa", name: "Sara", email: "sara@example.com", body: "خیلی مفید بود" });
    assert.deepEqual(c1.json(), { status: "pending" });
    assert.equal((await site("POST", "/v1/delivery/blog/comments", { postId: id, locale: "fa", name: "Bot", email: "b@x.com", body: "https://a.com https://b.com https://c.com" })).json().code, "TOO_MANY_LINKS");
    assert.equal((await site("POST", "/v1/delivery/blog/comments", { postId: id, locale: "fa", name: "Anon", body: "سلام دنیا" })).json().code, "EMAIL_REQUIRED");
    let post = (await site("GET", `/v1/delivery/blog/post?locale=fa&slug=tube`)).json().post;
    assert.equal(post.comments.length, 0);
    assert.equal(post.commentsOpen, true);
    assert.deepEqual(post.keywords, ["لایه مانع", "EVOH"]);

    // Moderation: the queue shows the email to moderators; approve and answer as the team.
    const queue = (await req(admin, "GET", "/v1/manage/blog/comments?status=pending")).json();
    assert.equal(queue.pending, 1);
    assert.equal(queue.items[0].email, "sara@example.com");
    assert.equal((await req(writer, "GET", "/v1/manage/blog/comments")).statusCode, 403, "authors do not moderate");
    const cid = queue.items[0].id;
    assert.equal((await req(admin, "POST", `/v1/manage/blog/comments/${cid}/moderate`, { status: "approved" })).statusCode, 200);
    assert.equal((await req(admin, "POST", `/v1/manage/blog/comments/${cid}/reply`, { body: "ممنون از شما" })).statusCode, 200);
    post = (await site("GET", `/v1/delivery/blog/post?locale=fa&slug=tube`)).json().post;
    assert.equal(post.comments.length, 1);
    assert.equal(post.comments[0].replies[0].team, true);

    // "known" moderation: an approved writer goes straight up.
    const s = (await req(admin, "GET", "/v1/manage/blog/settings")).json().settings;
    assert.equal((await req(admin, "PUT", "/v1/manage/blog/settings", { ...s, comments: { ...s.comments, moderation: "known" } })).statusCode, 200);
    assert.equal((await site("POST", "/v1/delivery/blog/comments", { postId: id, locale: "fa", name: "Sara", email: "SARA@example.com", body: "سؤال دیگری دارم" })).json().status, "approved");

    // Closing comments on the post, and switching comments off for the blog.
    const d = (await req(admin, "GET", `/v1/manage/blog/posts/${id}`)).json();
    await req(admin, "PUT", `/v1/manage/blog/posts/${id}`, { data: { ...d.data, commentsOpen: false }, baseRevisionId: d.draftRevisionId });
    await req(admin, "POST", `/v1/manage/blog/posts/${id}/publish`, {});
    assert.equal((await site("POST", "/v1/delivery/blog/comments", { postId: id, locale: "fa", name: "Ali", email: "ali@example.com", body: "بسته است؟" })).json().code, "COMMENTS_CLOSED");
    assert.equal((await site("GET", `/v1/delivery/blog/post?locale=fa&slug=tube`)).json().post.commentsOpen, false);

    // Newsletter: double opt-in through the emailed link, then a new post is mailed once.
    assert.deepEqual((await site("POST", "/v1/delivery/blog/subscribe", { email: "Reader@Example.com", locale: "fa" }, "198.51.100.1")).json(), { ok: true });
    const keys = pii(t.config);
    const mails = await t.db.q<{ id: string; kind: string; message_enc: string; key_id: string }>(`SELECT id, kind, message_enc, key_id FROM email_outbox ORDER BY created_at`);
    const confirm = mails.filter((m) => m.kind === "newsletter-confirm").map((m) => keys.decrypt<{ text: string; to: string }>(m.id, m.key_id, m.message_enc))[0]!;
    assert.equal(confirm.to, "reader@example.com");
    const tok = /token=([\w-]+)/.exec(confirm.text)![1]!;
    assert.equal((await site("POST", "/v1/delivery/blog/newsletter", { token: tok, action: "confirm" })).json().status, "confirmed");
    assert.equal((await req(admin, "GET", "/v1/manage/blog/subscribers")).json().confirmed, 1);
    await mk({ ...base, notifySubscribers: true, translations: { fa: tr("مقالهٔ تازه", "new-post") } });
    const news = (await t.db.q<{ id: string; message_enc: string; key_id: string }>(`SELECT id, message_enc, key_id FROM email_outbox WHERE kind = 'newsletter'`)).map((m) => keys.decrypt<{ text: string; to: string }>(m.id, m.key_id, m.message_enc));
    assert.equal(news.length, 1);
    assert.match(news[0]!.text, /new-post/);
    const off = /token=([\w-]+)/.exec(news[0]!.text)![1]!;
    assert.equal((await site("POST", "/v1/delivery/blog/newsletter", { token: off, action: "unsubscribe" })).json().status, "unsubscribed");
    assert.equal((await site("POST", "/v1/delivery/blog/newsletter", { token: tok, action: "confirm" })).statusCode, 404, "older links stop working");

    // Search ranks title and keyword matches.
    const found = (await site("GET", `/v1/delivery/blog/search?locale=fa&q=${encodeURIComponent("EVOH")}`)).json().items;
    assert.equal(found[0].slug, "tube");
    assert.equal((await site("GET", `/v1/delivery/blog/search?locale=fa&q=${encodeURIComponent("چاپ")}`)).json().items[0].slug, "print");

    // AI translation is off without a key; comments cleanup.
    assert.equal((await req(admin, "POST", `/v1/manage/blog/posts/${id}/translate`, { from: "fa", to: "en" })).json().code, "AI_OFF");
    assert.equal((await req(admin, "DELETE", `/v1/manage/blog/comments/${cid}`)).statusCode, 200);
    const sub = (await req(admin, "GET", "/v1/manage/blog/subscribers")).json().items[0];
    assert.equal((await req(admin, "DELETE", `/v1/manage/blog/subscribers/${sub.id}`)).statusCode, 200);
    // Settings off: the newsletter refuses sign-ups.
    await req(admin, "PUT", "/v1/manage/blog/settings", { ...s, sections: { ...s.sections, newsletter: false } });
    assert.equal((await site("POST", "/v1/delivery/blog/subscribe", { email: "x@example.com", locale: "fa" }, "198.51.100.9")).json().code, "NEWSLETTER_OFF");
  } finally {
    await t.close();
  }
});
