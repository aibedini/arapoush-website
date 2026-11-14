import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTranslation, type BlogPostData } from "@arapoush/schema";
import { testApp, signIn, as, type Operator } from "../testing.ts";
import { blogScheduledPublish } from "./delivery.ts";

const fa = (title: string, slug: string) => ({
  ...emptyTranslation(),
  enabled: true,
  title,
  slug,
  excerpt: "تیوب چندلایه از محصول در برابر نور، اکسیژن و رطوبت محافظت می‌کند و ماندگاری را بالا می‌برد.",
  body: [
    { id: "b1", kind: "p" as const, text: "متن **مهم** با [پیوند](/fa/products/multi-layer-tube) و [بد](javascript:alert(1))." },
    { id: "b2", kind: "h" as const, level: 2 as const, text: "لایه‌ها" },
  ],
  keyTakeaways: ["یک", "دو", "سه"],
  faq: [{ q: "چرا؟", a: "چون." }],
  seo: { keyphrase: "تیوب چندلایه" },
});

test("blog: authors draft, editors publish; slugs redirect; delivery, preview and schedule", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const writer = await signIn(t.app, t, "blog_author");
    const other = await signIn(t.app, t, "blog_author");
    const req = (op: Operator, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as "GET", url, headers: as(op), payload: payload as object });
    const site = (url: string, headers: Record<string, string> = {}) => t.app.inject({ method: "GET", url, headers: { authorization: `Bearer ${t.config.DELIVERY_TOKEN}`, ...headers } });

    // Taxonomy (editors) — authors may add tags while writing, not categories.
    const cat = (await req(admin, "POST", "/v1/manage/blog/categories", { name: { fa: "فناوری", en: "Technology" }, slug: { fa: "فناوری", en: "technology" } })).json().id;
    assert.equal((await req(writer, "POST", "/v1/manage/blog/categories", { name: { fa: "x" }, slug: { fa: "x" } })).statusCode, 403);
    const tag = (await req(writer, "POST", "/v1/manage/blog/tags", { name: { fa: "پایداری" }, slug: "پایداری" })).json().id;
    const author = (await req(admin, "POST", "/v1/manage/blog/authors", { slug: "sara", name: { fa: "سارا", en: "Sara" }, role: { en: "Packaging engineer" }, sameAs: ["https://www.linkedin.com/in/sara"] })).json().id;

    // The writer drafts; the draft is theirs.
    const created = await req(writer, "POST", "/v1/manage/blog/posts", {});
    assert.equal(created.statusCode, 200, created.body);
    const { id, revisionId } = created.json();
    const data: BlogPostData = { categoryId: cat, tagIds: [tag], authorId: author, reviewerId: null, cover: null, featured: true, products: ["tube"], relatedIds: [], translations: { fa: fa("آیندهٔ تیوب چندلایه", "آینده-تیوب-چندلایه") } };
    const saved = await req(writer, "PUT", `/v1/manage/blog/posts/${id}`, { data, baseRevisionId: revisionId });
    assert.equal(saved.statusCode, 200, saved.body);
    // Stale base → 412; someone else's post → refused.
    assert.equal((await req(writer, "PUT", `/v1/manage/blog/posts/${id}`, { data, baseRevisionId: revisionId })).statusCode, 412);
    assert.equal((await req(other, "PUT", `/v1/manage/blog/posts/${id}`, { data, baseRevisionId: saved.json().revisionId })).json().code, "NOT_YOUR_POST");
    // Unsafe content never validates.
    const bad = { ...data, translations: { fa: { ...data.translations.fa!, body: [{ id: "x", kind: "cta", text: "a", button: "b", href: "javascript:alert(1)" }] } } };
    assert.equal((await req(writer, "PUT", `/v1/manage/blog/posts/${id}`, { data: bad, baseRevisionId: saved.json().revisionId })).statusCode, 400);

    // Authors send for review but cannot publish.
    assert.equal((await req(writer, "POST", `/v1/manage/blog/posts/${id}/submit`)).statusCode, 200);
    assert.equal((await req(writer, "POST", `/v1/manage/blog/posts/${id}/publish`, {})).statusCode, 403);
    const pub = await req(admin, "POST", `/v1/manage/blog/posts/${id}/publish`, {});
    assert.equal(pub.statusCode, 200, pub.body);
    assert.deepEqual(pub.json().live, ["fa"]);

    // The website: list, post, taxonomy-filtered list, index.
    const list = (await site("/v1/delivery/blog/posts?locale=fa")).json();
    assert.equal(list.total, 1);
    assert.equal(list.items[0].category.slug, "فناوری");
    assert.equal((await site("/v1/delivery/blog/posts?locale=en")).json().total, 0, "no English translation yet");
    assert.equal((await site(`/v1/delivery/blog/posts?locale=fa&tag=${encodeURIComponent("پایداری")}`)).json().total, 1);
    const post = (await site(`/v1/delivery/blog/post?locale=fa&slug=${encodeURIComponent("آینده-تیوب-چندلایه")}`)).json().post;
    assert.equal(post.author.name, "سارا");
    assert.deepEqual(post.alternates, { fa: "آینده-تیوب-چندلایه" });
    assert.ok(post.wordCount > 3);

    // A renamed slug keeps answering, as a redirect to the new one.
    const cur = (await req(admin, "GET", `/v1/manage/blog/posts/${id}`)).json();
    const renamed = { ...data, translations: { fa: { ...data.translations.fa!, slug: "تیوب-چندلایه" } } };
    await req(admin, "PUT", `/v1/manage/blog/posts/${id}`, { data: renamed, baseRevisionId: cur.draftRevisionId });
    await req(admin, "POST", `/v1/manage/blog/posts/${id}/publish`, {});
    assert.deepEqual((await site(`/v1/delivery/blog/post?locale=fa&slug=${encodeURIComponent("آینده-تیوب-چندلایه")}`)).json(), { redirect: "تیوب-چندلایه" });

    // A second post may not take either slug.
    const second = (await req(admin, "POST", "/v1/manage/blog/posts", {})).json();
    const clash = await req(admin, "PUT", `/v1/manage/blog/posts/${second.id}`, { data: { ...data, translations: { fa: fa("دیگر", "آینده-تیوب-چندلایه") } }, baseRevisionId: second.revisionId });
    assert.equal(clash.json().code, "SLUG_TAKEN");

    // Scheduled: not live until the job runs after its time.
    const s2 = await req(admin, "PUT", `/v1/manage/blog/posts/${second.id}`, { data: { ...data, featured: false, translations: { fa: fa("مقالهٔ دوم", "مقاله-دوم") } }, baseRevisionId: second.revisionId });
    assert.equal(s2.statusCode, 200, s2.body);
    const when = new Date(Date.now() + 3_600_000).toISOString();
    assert.equal((await req(admin, "POST", `/v1/manage/blog/posts/${second.id}/publish`, { at: when })).json().status, "scheduled");
    assert.equal((await site("/v1/delivery/blog/posts?locale=fa")).json().total, 1);
    await t.db.q(`UPDATE blog_posts SET scheduled_at = clock_timestamp() - interval '1 second' WHERE id = $1`, [second.id]);
    await blogScheduledPublish.run(t, t.app.log);
    assert.equal((await site("/v1/delivery/blog/posts?locale=fa")).json().total, 2);
    const related = (await site(`/v1/delivery/blog/post?locale=fa&slug=${encodeURIComponent("مقاله-دوم")}`)).json().post.related;
    assert.equal(related[0].id, id, "same category comes first");

    // Index for the sitemap and feeds.
    const index = (await site("/v1/delivery/blog/index")).json();
    assert.equal(index.posts.length, 2);
    assert.equal(index.authors[0].slug, "sara");

    // Preview: a token for one post opens only that post's draft.
    const link = (await req(admin, "POST", `/v1/manage/blog/posts/${id}/preview`, { locale: "fa" })).json().url as string;
    const token = new URL(link).searchParams.get("token")!;
    assert.match(new URL(link).searchParams.get("path")!, new RegExp(`/fa/blog/preview/${id}$`));
    assert.equal((await site(`/v1/delivery/blog/preview/${id}?locale=fa`, { "opex-preview": token })).statusCode, 200);
    assert.equal((await site(`/v1/delivery/blog/preview/${second.id}?locale=fa`, { "opex-preview": token })).statusCode, 401);

    // In use → cannot delete; unpublish → 404 on the site; history and restore.
    assert.equal((await req(admin, "DELETE", `/v1/manage/blog/categories/${cat}`)).json().code, "IN_USE");
    assert.equal((await req(admin, "POST", `/v1/manage/blog/posts/${second.id}/unpublish`)).statusCode, 200);
    assert.equal((await site(`/v1/delivery/blog/post?locale=fa&slug=${encodeURIComponent("مقاله-دوم")}`)).statusCode, 404);
    const revs = (await req(admin, "GET", `/v1/manage/blog/posts/${id}/revisions`)).json();
    assert.ok(revs.length >= 3 && revs.some((r: { published: boolean }) => r.published));
    const one = (await req(admin, "GET", `/v1/manage/blog/posts/${id}/revisions/${revs.at(-1).id}`)).json();
    assert.equal(one.number, 1);
    assert.equal((await req(admin, "POST", `/v1/manage/blog/posts/${id}/restore`, { revisionId: revs[1].id })).statusCode, 200);
    assert.equal((await req(admin, "DELETE", `/v1/manage/blog/posts/${second.id}`)).statusCode, 200);
    assert.ok(!(await req(admin, "GET", "/v1/manage/blog/posts")).json().some((p: { id: string }) => p.id === second.id));
    const tax = (await req(writer, "GET", "/v1/manage/blog/taxonomy")).json();
    assert.equal(tax.categories[0].posts, 1);
    assert.equal((await req(admin, "PUT", `/v1/manage/blog/authors/${author}`, { slug: "sara", name: { fa: "سارا کریمی" } })).statusCode, 200);
    assert.equal((await req(admin, "DELETE", `/v1/manage/blog/tags/does-not-exist`)).statusCode, 404);
    assert.equal((await req(admin, "PUT", `/v1/manage/blog/categories/${cat}`, { name: { fa: "فناوری" }, slug: { fa: "فناوری" } })).statusCode, 200);
    assert.equal((await req(admin, "PUT", `/v1/manage/blog/tags/${tag}`, { name: { fa: "پایداری" }, slug: "پایداری" })).statusCode, 200);
  } finally {
    await t.close();
  }
});
