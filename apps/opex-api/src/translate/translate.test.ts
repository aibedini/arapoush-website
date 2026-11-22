import { test } from "node:test";
import assert from "node:assert/strict";
import { contentType, emptyTranslation, getAt, localizedLeaves, type BlogPostData } from "@arapoush/schema";
import { testApp, signIn, as, type Operator } from "../testing.ts";
import { engine } from "./ai.ts";

test("AI translation: pages and sections, blog posts and blog lists, into several languages as drafts", async () => {
  // A fake translator: "[en] <source>". Records what it was asked.
  const calls: { to: string; keys: string[] }[] = [];
  const real = engine.translate;
  engine.translate = async (_c, _l, job) => new Map(job.targets.map((t) => (calls.push({ to: t.to, keys: t.segments.map((s) => s.key) }), [t.to, new Map(t.segments.map((s) => [s.key, `[${t.to}] ${s.text}`]))])));
  const t = await testApp({ ANTHROPIC_API_KEY: "sk-test" }, { seed: true });
  try {
    const admin = await signIn(t.app, t);
    const viewer = await signIn(t.app, t, "viewer");
    const req = (op: Operator, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as "GET", url, headers: as(op), payload: payload as object });

    // Overview: languages, coverage per entry.
    const ov = (await req(admin, "GET", "/v1/manage/translate")).json();
    assert.equal(ov.ai, true);
    assert.deepEqual(ov.locales.map((l: { code: string }) => l.code), ["fa", "en", "tr"]);
    assert.ok(ov.entries.length > 0);
    const entry = ov.entries.find((e: { total: number }) => e.total > 2);
    assert.ok(entry, "a seeded entry with localized text");
    assert.equal((await req(viewer, "POST", `/v1/manage/translate/entries/${entry.type}`, { from: "fa", to: ["en"] })).statusCode, 403, "viewers do not translate");
    assert.equal((await req(admin, "POST", `/v1/manage/translate/entries/${entry.type}`, { from: "fa", to: ["fa", "en"] })).json().code, "SAME_LANGUAGE");

    // Empty one English value, then "missing" fills exactly that one; Turkish is complete already.
    const cur = (await req(admin, "GET", `/v1/manage/entries/${entry.type}`)).json();
    const leaf = localizedLeaves(contentType(entry.type)!.schema, cur.draft.data).find((l) => l.value.fa?.trim() && l.value.en?.trim() && l.value.tr?.trim())!;
    assert.ok(leaf);
    const p = await req(admin, "PATCH", `/v1/manage/entries/${entry.type}`, { base_revision_id: cur.draft.id, ops: [{ path: `${leaf.path}@en`, value: "" }] });
    assert.equal(p.statusCode, 200, p.body);
    const dry = (await req(admin, "POST", `/v1/manage/translate/entries/${entry.type}`, { from: "fa", to: ["en", "tr"], dryRun: true })).json();
    assert.equal(dry.segments, 1);
    assert.equal(dry.revision, null);
    assert.equal(calls.length, 0, "a dry run does not call the AI");
    const r1 = await req(admin, "POST", `/v1/manage/translate/entries/${entry.type}`, { from: "fa", to: ["en", "tr"] });
    assert.equal(r1.statusCode, 200, r1.body);
    assert.equal(r1.json().written, 1);
    assert.deepEqual(r1.json().perLocale, { en: 1, tr: 0 });
    const after = (await req(admin, "GET", `/v1/manage/entries/${entry.type}`)).json();
    assert.equal(getAt(after.draft.data, `${leaf.path}@en`), `[en] ${leaf.value.fa}`);
    assert.equal(getAt(after.draft.data, `${leaf.path}@tr`), leaf.value.tr, "complete values stay");
    assert.match(after.draft.note, /AI translation fa → en, tr/);

    // "all" within a scope rewrites only that part.
    const r2 = (await req(admin, "POST", `/v1/manage/translate/entries/${entry.type}`, { from: "fa", to: ["tr"], mode: "all", scope: leaf.path })).json();
    assert.equal(r2.written, 1);
    assert.deepEqual(calls.at(-1), { to: "tr", keys: [leaf.path] });

    // Blog: a Persian-only post becomes English and Turkish (slug, body, switched on in the draft).
    const c = (await req(admin, "POST", "/v1/manage/blog/posts", {})).json();
    const data: BlogPostData = {
      categoryId: null, tagIds: [], authorId: null, reviewerId: null, cover: null, featured: false, products: [], relatedIds: [],
      translations: { fa: { ...emptyTranslation(), enabled: true, title: "تیوب چندلایه", slug: "tube", excerpt: "خلاصه", body: [{ id: "p1", kind: "p", text: "متن **مهم**" }], faq: [{ q: "چرا؟", a: "چون." }] } },
    };
    assert.equal((await req(admin, "PUT", `/v1/manage/blog/posts/${c.id}`, { data, baseRevisionId: c.revisionId })).statusCode, 200);
    const b = await req(admin, "POST", `/v1/manage/translate/blog/${c.id}`, { from: "fa", to: ["en", "tr"] });
    assert.equal(b.statusCode, 200, b.body);
    const post = (await req(admin, "GET", `/v1/manage/blog/posts/${c.id}`)).json();
    const en = post.data.translations.en;
    assert.equal(en.title, "[en] تیوب چندلایه");
    assert.equal(en.enabled, true);
    assert.ok(en.slug);
    assert.equal(en.body[0].text, "[en] متن **مهم**");
    assert.equal(en.faq[0].a, "[en] چون.");
    assert.equal(post.data.translations.tr.title, "[tr] تیوب چندلایه");
    // Done already: "missing" has nothing left to do.
    assert.equal((await req(admin, "POST", `/v1/manage/translate/blog/${c.id}`, { from: "fa", to: ["en", "tr"], dryRun: true })).json().segments, 0);

    // Blog lists: a category gets its English name and slug.
    const cat = (await req(admin, "POST", "/v1/manage/blog/categories", { name: { fa: "بسته‌بندی" }, slug: { fa: "packaging-fa" } })).json();
    const tx = await req(admin, "POST", "/v1/manage/translate/blog-taxonomy", { from: "fa", to: ["en"] });
    assert.equal(tx.statusCode, 200, tx.body);
    const tax = (await req(admin, "GET", "/v1/manage/blog/taxonomy")).json();
    const got = tax.categories.find((x: { id: string }) => x.id === cat.id);
    assert.equal(got.name.en, "[en] بسته‌بندی");
    assert.ok(got.slug.en);

    // Without a key the feature is off (dry runs still count).
    const off = await testApp({}, { seed: true });
    try {
      const a2 = await signIn(off.app, off);
      const o = await off.app.inject({ method: "POST", url: `/v1/manage/translate/entries/${entry.type}`, headers: as(a2), payload: { from: "fa", to: ["en"], mode: "all" } });
      assert.equal(o.json().code, "AI_OFF");
    } finally {
      await off.close();
    }
  } finally {
    engine.translate = real;
    await t.close();
  }
});
