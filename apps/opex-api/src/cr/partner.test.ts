import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getAt } from "@arapoush/schema";
import { testApp, signIn, stepUp, as, partnerSession, type Operator } from "../testing.ts";

const TOKEN = "test-delivery-token-0123456789abcdef";
const env = () => ({ DELIVERY_TOKEN: TOKEN, MEDIA_DIR: mkdtempSync(path.join(tmpdir(), "opex-media-")) });
const bearer = { authorization: `Bearer ${TOKEN}` };
type T = Awaited<ReturnType<typeof testApp>>;

async function setup(grantScope: Record<string, unknown> = { types: ["page.printing"], fields: ["/hero/**", "/tech/**", "/images/**"], locales: ["fa", "en"] }, actions = ["read", "propose", "media.upload", "cr.withdraw"]) {
  const t = await testApp(env(), { seed: true });
  const admin = await signIn(t.app, t, "super_admin");
  await stepUp(t.app, admin);
  const p = await partnerSession(t.app, admin);
  const grant = await t.app.inject({ method: "POST", url: "/v1/manage/grants", headers: as(admin), payload: { subject_kind: "partner_role", subject_id: "aracms_editor", scope: grantScope, actions } });
  assert.equal(grant.statusCode, 200, grant.body);
  return { t, admin, p };
}
const live = async (t: T, p: string) => getAt((await t.app.inject({ method: "GET", url: "/v1/delivery/content/page.printing", headers: bearer })).json().data, p);
const actions = async (t: T) => (await t.db.q<{ action: string }>(`SELECT action FROM audit_events ORDER BY seq`)).map((r) => r.action);
const propose = (p: Awaited<ReturnType<typeof partnerSession>>, base: string, items: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  p.call("POST", "/v1/partner/change-requests", { body: { title: "Copy fix", items: items.map((i) => ({ entry: "page.printing", base_revision_id: base, ...i })) }, ...extra });

test("AraCMS reads only granted fields and locales; schema lists only what it may see", async () => {
  const { t, p } = await setup();
  try {
    const c = await p.call("GET", "/v1/partner/content/page.printing");
    assert.equal(c.statusCode, 200, c.body);
    const { data, base_revision_id } = c.json();
    assert.ok(base_revision_id.startsWith("rev_"));
    assert.deepEqual(Object.keys(data).sort(), ["hero", "images", "tech"]);
    assert.deepEqual(Object.keys(data.hero.title).sort(), ["en", "fa"], "Turkish is not granted");
    assert.equal(data.tech.items[0].sample, undefined, "operator-only fields are never shown to partners");
    assert.equal((await p.call("GET", "/v1/partner/content/global.site")).statusCode, 403);
    const schema = (await p.call("GET", "/v1/partner/schema")).json();
    assert.deepEqual(schema.map((s: { key: string }) => s.key), ["page.printing"]);
    assert.ok((await actions(t)).includes("authz.denied"));
  } finally {
    await t.close();
  }
});

test("writes need a valid request signature and an Idempotency-Key; replays return the first answer", async () => {
  const { t, p } = await setup();
  try {
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const items = [{ path: "/hero/title", locale: "en", value: "ARAPOUSH Tube Printing" }];
    assert.equal((await propose(p, base, items, { unsigned: true })).statusCode, 401);
    assert.equal((await propose(p, base, items, { tamper: true })).statusCode, 401, "body changed after signing");
    const first = await propose(p, base, items, { idem: "11111111-2222-4333-8444-555555555555", endUserIp: "198.51.100.7" });
    assert.equal(first.statusCode, 201, first.body);
    const again = await propose(p, base, items, { idem: "11111111-2222-4333-8444-555555555555", endUserIp: "198.51.100.7" });
    assert.equal(again.statusCode, 201);
    assert.equal(again.headers["idempotent-replayed"], "true");
    assert.equal(again.json().id, first.json().id);
    const other = await propose(p, base, [{ ...items[0], value: "Other" }], { idem: "11111111-2222-4333-8444-555555555555" });
    assert.equal(other.json().code, "IDEMPOTENCY_KEY_REUSED");
    // The audit row records the AraCMS user's own IP as asserted by AraCMS, next to the server's IP.
    const [row] = await t.db.q<{ request: { asserted_end_user_ip: string }; actor: { kind: string; via_client: string } }>(`SELECT request, actor FROM audit_events WHERE action = 'cr.submitted'`);
    assert.equal(row!.request.asserted_end_user_ip, "198.51.100.7");
    assert.equal(row!.actor.kind, "partner_user");
    assert.equal(row!.actor.via_client, p.client_id);
  } finally {
    await t.close();
  }
});

test("grants and locks are enforced per item", async () => {
  const { t, p } = await setup();
  try {
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    assert.equal((await propose(p, base, [{ path: "/hero/title", locale: "tr", value: "x" }])).json().code, "GRANT_DENIED");
    assert.equal((await propose(p, base, [{ path: "/guide/title", locale: "fa", value: "x" }])).json().code, "GRANT_DENIED");
    assert.equal((await propose(p, base, [{ path: "/tech/items[id=flexo]/id", value: "x" }])).json().code, "FIELD_LOCKED");
    const bidi = await propose(p, base, [{ path: "/hero/title", locale: "en", value: "evil‮text" }]);
    assert.equal(bidi.json().code, "VALIDATION_FAILED");
    assert.equal((await propose(p, base, [{ path: "/hero/nope", locale: "en", value: "x" }])).json().code, "PATH_NOT_FOUND");
  } finally {
    await t.close();
  }
});

test("review flow: pending → partial approval → published; AraCMS is notified", async () => {
  const { t, admin, p } = await setup();
  try {
    const hook = await t.app.inject({ method: "PUT", url: `/v1/manage/partners/${p.partnerId}/webhook`, headers: as(admin), payload: { url: "https://aracms.test/opex-hook" } });
    assert.equal(hook.statusCode, 200, hook.body);
    assert.equal(hook.json().secret.length, 43);
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const cr = await propose(p, base, [
      { path: "/hero/title", locale: "en", value: "Printing at ARAPOUSH" },
      { path: "/hero/eyebrow", locale: "en", value: "Not this one" },
    ]);
    assert.equal(cr.statusCode, 201, cr.body);
    assert.equal(cr.json().state, "pending_review");
    assert.equal(cr.json().decision.effect, "require_review");
    const id = cr.json().id;

    const detail = (await t.app.inject({ method: "GET", url: `/v1/manage/change-requests/${id}`, headers: { cookie: admin.cookie } })).json();
    assert.equal(detail.items.length, 2);
    assert.equal(detail.author, "Sara (AraCMS)");
    const eyebrow = detail.items.find((i: { path: string }) => i.path === "/hero/eyebrow@en");
    const ok = await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${id}/approve`, headers: as(admin), payload: { publish: true, decisions: { [eyebrow.id]: { decision: "rejected", reason: "Eyebrow stays" } } } });
    assert.equal(ok.statusCode, 200, ok.body);
    const state = (await p.call("GET", `/v1/partner/change-requests/${id}`)).json();
    assert.equal(state.state, "published");
    assert.equal(state.items.find((i: { path: string }) => i.path === "/hero/eyebrow@en").reason, "Eyebrow stays");
    assert.equal(await live(t, "/hero/title@en"), "Printing at ARAPOUSH");
    assert.notEqual(await live(t, "/hero/eyebrow@en"), "Not this one");

    const revs = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing/revisions", headers: { cookie: admin.cookie } })).json();
    assert.equal(revs[0].via_cr_id, id);
    const events = (await t.db.q<{ event: string; payload: { data: { state?: string } } }>(`SELECT event, payload FROM webhook_deliveries WHERE target = $1 ORDER BY created_at`, [`partner:${p.partnerId}`])).map((r) => `${r.event}:${r.payload.data.state ?? ""}`);
    assert.deepEqual(events, ["cr.state_changed:pending_review", "cr.state_changed:approved", "content.published:", "cr.state_changed:published"]);
    for (const a of ["cr.submitted", "cr.policy_decision", "cr.pending_review", "cr.approved", "cr.published", "content.publish"]) assert.ok((await actions(t)).includes(a), a);
  } finally {
    await t.close();
  }
});

test("auto-approve policy publishes small edits at once; bigger ones wait for review", async () => {
  const { t, admin, p } = await setup();
  try {
    const sim = await t.app.inject({ method: "POST", url: "/v1/manage/policies/simulate", headers: as(admin), payload: { items: [{ type: "page.printing", path: "/hero/title@en", old: "ARAPOUSH Tube Printing Technologies", value: "ARAPOUSH Tube Printing Technology" }], role: "aracms_editor", policy: { name: "Typos", scope: { types: ["page.printing"] }, conditions: { textEditDistanceRatio: { lte: 0.2 } }, effect: "auto_approve", auto_publish: true } } });
    assert.equal(sim.json().effect, "auto_approve");
    const pol = await t.app.inject({ method: "POST", url: "/v1/manage/policies", headers: as(admin), payload: { name: "Typos", scope: { types: ["page.printing"] }, conditions: { textEditDistanceRatio: { lte: 0.2 }, noLinks: true }, effect: "auto_approve", auto_publish: true } });
    assert.equal(pol.statusCode, 200, pol.body);
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const small = await propose(p, base, [{ path: "/hero/title", locale: "en", value: "ARAPOUSH Tube Printing Technology" }]);
    assert.equal(small.json().state, "published", small.body);
    assert.equal(await live(t, "/hero/title@en"), "ARAPOUSH Tube Printing Technology");
    const base2 = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const big = await propose(p, base2, [{ path: "/hero/title", locale: "en", value: "A completely new headline" }]);
    assert.equal(big.json().state, "pending_review");
    assert.match(big.json().decision.reasons.join(), /edit ratio/);
    const [row] = await t.db.q<{ resource: { policy: string } }>(`SELECT resource FROM audit_events WHERE action = 'cr.policy_decision' ORDER BY seq LIMIT 1`);
    assert.equal(row!.resource.policy, pol.json().id, "auto-approvals record the policy that matched");
  } finally {
    await t.close();
  }
});

test("an operator edit of the same field moves the CR to needs_rebase; resubmit against the new base", async () => {
  const { t, admin, p } = await setup();
  try {
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const id = (await propose(p, base, [{ path: "/hero/title", locale: "en", value: "AraCMS headline" }])).json().id;
    const e = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing", headers: { cookie: admin.cookie } })).json();
    const edit = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/page.printing", headers: as(admin), payload: { base_revision_id: e.draft.id, ops: [{ path: "/hero/title@en", value: "Operator headline" }] } });
    assert.equal(edit.statusCode, 200, edit.body);
    const cr = (await p.call("GET", `/v1/partner/change-requests/${id}`)).json();
    assert.equal(cr.state, "needs_rebase");
    assert.equal(cr.conflicts[0].path, "page.printing/hero/title@en");
    assert.equal(cr.conflicts[0].current, "Operator headline");
    // Approving a stale CR is refused by state; the author rebases on the newest draft.
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${id}/approve`, headers: as(admin), payload: {} })).statusCode, 409);
    const fresh = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const re = await p.call("POST", `/v1/partner/change-requests/${id}/resubmit`, { body: { base_revision_ids: { "page.printing": fresh } } });
    assert.equal(re.statusCode, 200, re.body);
    assert.equal(re.json().state, "pending_review");
    const ok = await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${id}/approve`, headers: as(admin), payload: {} });
    assert.equal(ok.json().state, "approved");
    const draft = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing", headers: { cookie: admin.cookie } })).json().draft.data;
    assert.equal(getAt(draft, "/hero/title@en"), "AraCMS headline");
  } finally {
    await t.close();
  }
});

test("withdraw, reject, amend and four-eyes approval", async () => {
  const { t, admin, p } = await setup();
  try {
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const w = (await propose(p, base, [{ path: "/hero/lead", locale: "en", value: "Withdrawn soon" }])).json().id;
    assert.equal((await p.call("POST", `/v1/partner/change-requests/${w}/withdraw`)).json().state, "withdrawn");
    const r = (await propose(p, base, [{ path: "/hero/lead", locale: "en", value: "Rejected" }])).json().id;
    const rej = await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${r}/reject`, headers: as(admin), payload: { reason: "Off brand" } });
    assert.equal(rej.json().state, "rejected");

    // Amendment: the operator fixes the wording; the original item is kept, rejected, for the record.
    const a = (await propose(p, base, [{ path: "/hero/lead", locale: "en", value: "Typo heavy lead" }])).json().id;
    const item = (await p.call("GET", `/v1/partner/change-requests/${a}`)).json().items[0].id;
    const am = await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${a}/amend`, headers: as(admin), payload: { item, value: { fa: "x", en: "Clean lead", tr: "y" } } });
    assert.equal(am.statusCode, 400, "amending a locale item takes the plain string");
    const am2 = await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${a}/amend`, headers: as(admin), payload: { item, value: "Clean lead" } });
    assert.equal(am2.statusCode, 200, am2.body);
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${a}/approve`, headers: as(admin), payload: {} })).json().state, "approved");
    const draft = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing", headers: { cookie: admin.cookie } })).json().draft.data;
    assert.equal(getAt(draft, "/hero/lead@en"), "Clean lead");
    const items = (await p.call("GET", `/v1/partner/change-requests/${a}`)).json().items;
    assert.deepEqual(items.map((i: { decision: string; by_operator: boolean }) => [i.decision, i.by_operator]), [["rejected", false], ["approved", true]]);

    // Four-eyes: one operator's approval is recorded; a second operator completes it.
    await t.app.inject({ method: "POST", url: "/v1/manage/policies", headers: as(admin), payload: { name: "Two people", priority: 500, scope: { types: ["page.printing"], fields: ["/tech/**"] }, conditions: { requiresSecondApprover: true }, effect: "auto_approve" } });
    const base2 = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const f = (await propose(p, base2, [{ path: "/tech/items[id=flexo]/short", locale: "en", value: "Flexo, reviewed twice" }])).json();
    assert.equal(f.state, "pending_review");
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${f.id}/approve`, headers: as(admin), payload: {} })).json().state, "pending_review");
    const second: Operator = await signIn(t.app, t, "operator");
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/change-requests/${f.id}/approve`, headers: as(second), payload: {} })).json().state, "approved");
  } finally {
    await t.close();
  }
});

test("AraCMS uploads media (signed bytes) and proposes it; a preview link shows the CR applied", async () => {
  const { t, p } = await setup();
  try {
    const png = await sharp({ create: { width: 60, height: 80, channels: 3, background: "#c9a227" } }).png().toBuffer();
    const up = await p.call("POST", "/v1/partner/media", { raw: png, headers: { "x-filename": "gold tube.png" } });
    assert.equal(up.statusCode, 200, up.body);
    const { asset } = up.json();
    assert.equal((await p.call("GET", `/v1/partner/media/${asset}`)).json().status, "clean");
    const base = (await p.call("GET", "/v1/partner/content/page.printing")).json().base_revision_id;
    const cr = await propose(p, base, [{ path: "/images/tubeGold", value: { asset, alt: { en: "Gold tube" } } }]);
    assert.equal(cr.statusCode, 201, cr.body);
    const prev = await p.call("POST", "/v1/partner/previews", { body: { cr: cr.json().id, locale: "en" } });
    assert.equal(prev.statusCode, 200, prev.body);
    const tok = new URL(prev.json().url).searchParams.get("token")!;
    const pv = await t.app.inject({ method: "GET", url: "/v1/delivery/preview", headers: { ...bearer, "opex-preview": tok } });
    assert.equal(getAt(pv.json().entries["page.printing"].data, "/images/tubeGold/src"), `/media/${asset}.webp`);
    assert.equal(getAt(pv.json().entries["page.printing"].data, "/images/tubeGold/width"), 60);
    // Someone else's asset id cannot be used.
    const foreign = await propose(p, base, [{ path: "/images/tubeGold", value: { asset: "ast_00000000000000000000000000" } }]);
    assert.equal(foreign.json().code, "UNKNOWN_ASSET");
  } finally {
    await t.close();
  }
});

test("the OpenAPI document lists every partner route", async () => {
  const t = await testApp(env());
  try {
    const doc = (await t.app.inject({ method: "GET", url: "/v1/partner/openapi.json" })).json();
    assert.equal(doc.openapi, "3.1.0");
    const routes = t.app.printRoutes({ commonPrefix: false });
    for (const p of ["/v1/partner/me", "/v1/partner/schema", "/v1/partner/content/{type}", "/v1/partner/media", "/v1/partner/change-requests", "/v1/partner/change-requests/{id}/resubmit", "/v1/partner/previews"]) assert.ok(doc.paths[p], p);
    assert.ok(routes.includes("change-requests"));
  } finally {
    await t.close();
  }
});
