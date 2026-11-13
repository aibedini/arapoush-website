import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { CONTENT_TYPES, getAt } from "@arapoush/schema";
import { testApp, signIn, stepUp, as } from "../testing.ts";
import { deliverPending } from "../webhooks/outbox.ts";

const TOKEN = "test-delivery-token-0123456789abcdef";
const env = () => ({ DELIVERY_TOKEN: TOKEN, MEDIA_DIR: mkdtempSync(path.join(tmpdir(), "opex-media-")), SITE_WEBHOOK_URL: "https://site.test/api/opex/revalidate", SITE_WEBHOOK_SECRET: "test-webhook-secret-0123456789" });
const bearer = { authorization: `Bearer ${TOKEN}` };

test("seed publishes the website's content; the Delivery API serves it to the site only", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const bundle = await t.app.inject({ method: "GET", url: "/v1/delivery/bundle", headers: bearer });
    assert.equal(bundle.statusCode, 200);
    const b = bundle.json();
    // Every seeded content type is published (forms ride alongside).
    assert.equal(Object.keys(b.entries).filter((k) => !k.startsWith("form.") && k !== "settings.site").length, CONTENT_TYPES.length);
    assert.equal(b.entries["settings.site"].data.indexing, true, "public site settings ride in the bundle (S3)");
    assert.ok(b.entries["form.quote"] && b.entries["form.contact"], "published forms ride in the bundle");
    assert.equal(getAt(b.entries["page.printing"].data, "/hero/title@en"), "ARAPOUSH Tube Printing Technologies");
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/delivery/bundle", headers: { authorization: "Bearer wrong-token-wrong-token-wrong" } })).statusCode, 403);
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/delivery/bundle" })).statusCode, 401);
    const again = await t.app.inject({ method: "GET", url: "/v1/delivery/bundle", headers: { ...bearer, "if-none-match": String(bundle.headers.etag) } });
    assert.equal(again.statusCode, 304);
  } finally {
    await t.close();
  }
});

test("draft edit → publish → delivered; stale edits are refused; rollback restores", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const op = await signIn(t.app, t, "operator");
    const entry = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing", headers: { cookie: op.cookie } })).json();
    const base = entry.draft.id;
    const edit = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/page.printing", headers: as(op), payload: { base_revision_id: base, ops: [{ path: "/hero/title@fa", value: "فناوری‌های چاپ آراپوش" }] } });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.deepEqual(edit.json().changes.map((c: { path: string }) => c.path), ["/hero/title@fa"]);
    // Someone else still holds the old base: refused, not overwritten.
    const stale = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/page.printing", headers: as(op), payload: { base_revision_id: base, ops: [{ path: "/hero/lead@fa", value: "x" }] } });
    assert.equal(stale.statusCode, 412);
    assert.equal(stale.json().code, "CONFLICT_BASE_REVISION");

    // Not live until published.
    const live = async () => getAt((await t.app.inject({ method: "GET", url: "/v1/delivery/content/page.printing", headers: bearer })).json().data, "/hero/title@fa");
    assert.equal(await live(), "فناوری‌های چاپ روی تیوب‌های آراپوش");
    const pub = await t.app.inject({ method: "POST", url: "/v1/manage/entries/page.printing/publish", headers: as(op), payload: {} });
    assert.equal(pub.statusCode, 200, pub.body);
    assert.equal(await live(), "فناوری‌های چاپ آراپوش");

    // The website is told, with a verifiable signature.
    let got: { body: string; sig: string } | null = null;
    await deliverPending({ config: t.config, db: t.db }, t.app.log, (async (_u: string, init: RequestInit) => {
      got = { body: String(init.body), sig: String((init.headers as Record<string, string>)["opex-signature"]) };
      return new Response(null, { status: 204 });
    }) as typeof fetch);
    assert.ok(got);
    const { body, sig } = got as { body: string; sig: string };
    const [, ts, v1] = /^t=(\d+), v1=([0-9a-f]+)$/.exec(sig)!;
    assert.equal(v1, createHmac("sha256", "test-webhook-secret-0123456789").update(`${ts}.${body}`).digest("hex"));
    assert.equal(JSON.parse(body).data.entry, "page.printing");

    const revs = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing/revisions", headers: { cookie: op.cookie } })).json();
    assert.equal(revs.length, 2);
    const first = revs.find((r: { number: number }) => r.number === 1).id;
    await stepUp(t.app, op);
    const rb = await t.app.inject({ method: "POST", url: "/v1/manage/entries/page.printing/rollback", headers: as(op), payload: { revision_id: first } });
    assert.equal(rb.statusCode, 200, rb.body);
    assert.equal(await live(), "فناوری‌های چاپ روی تیوب‌های آراپوش");

    const a = (await t.db.q<{ action: string }>(`SELECT action FROM audit_events ORDER BY seq`)).map((r) => r.action);
    for (const x of ["content.revision.create", "content.publish", "content.rollback"]) assert.ok(a.includes(x), x);
  } finally {
    await t.close();
  }
});

test("locked fields, bad text and unknown fields are refused with exact paths", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const op = await signIn(t.app, t, "operator");
    const e = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.effervescent.page", headers: { cookie: op.cookie } })).json();
    const locked = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(op), payload: { base_revision_id: e.draft.id, ops: [{ path: "/data/sizes[id=27x175]/h", value: 999 }] } });
    assert.equal(locked.json().code, "FIELD_LOCKED");
    const bidi = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(op), payload: { base_revision_id: e.draft.id, ops: [{ path: "/productEff/title[0]@en", value: "evil‮text" }] } });
    assert.equal(bidi.statusCode, 400);
    assert.ok(bidi.json().issues.some((i: { path: string }) => i.path.includes("@en")));
    const missing = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(op), payload: { base_revision_id: e.draft.id, ops: [{ path: "/nope/x", value: 1 }] } });
    assert.equal(missing.json().code, "PATH_NOT_FOUND");
    const viewer = await signIn(t.app, t, "viewer");
    assert.equal((await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(viewer), payload: { base_revision_id: e.draft.id, ops: [{ path: "/productEff/title[0]@en", value: "x" }] } })).statusCode, 403);
  } finally {
    await t.close();
  }
});

test("media: re-encoded on upload, private until published, active content rejected", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const op = await signIn(t.app, t, "operator");
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#09263c" } }).png().withMetadata({ exif: { IFD0: { Copyright: "secret GPS" } } }).toBuffer();
    const upload = (buf: Buffer, name: string, type: string) => {
      const boundary = "----opex";
      const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      return t.app.inject({ method: "POST", url: "/v1/manage/media", headers: { ...as(op), "content-type": `multipart/form-data; boundary=${boundary}` }, payload });
    };
    const up = await upload(png, "hero.png", "image/png");
    assert.equal(up.statusCode, 200, up.body);
    const asset = up.json();
    assert.equal(asset.mime, "image/webp");
    assert.equal(asset.width, 40);
    assert.match(asset.url, /^\/media\/ast_[0-9A-Z]{26}\.webp$/);
    assert.equal((await t.app.inject({ method: "GET", url: asset.url })).statusCode, 404, "not public before publish");

    const e = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing", headers: { cookie: op.cookie } })).json();
    const set = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/page.printing", headers: as(op), payload: { base_revision_id: e.draft.id, ops: [{ path: "/images/tubeGold", value: { src: asset.url, width: 40, height: 30 } }] } });
    assert.equal(set.statusCode, 200, set.body);
    await t.app.inject({ method: "POST", url: "/v1/manage/entries/page.printing/publish", headers: as(op), payload: {} });
    const served = await t.app.inject({ method: "GET", url: asset.url });
    assert.equal(served.statusCode, 200);
    assert.equal(served.headers["content-type"], "image/webp");
    const meta = await sharp(served.rawPayload).metadata();
    assert.equal(meta.exif, undefined, "metadata stripped");

    const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "logo.svg", "image/svg+xml");
    assert.equal(svg.json().code, "MEDIA_REJECTED");
    const pdf = await upload(Buffer.from("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"), "guide.pdf", "application/pdf");
    assert.equal(pdf.json().code, "MEDIA_REJECTED");
    const exe = await upload(Buffer.from("MZ\x90\x00 this is not an image at all......"), "photo.jpg", "image/jpeg");
    assert.equal(exe.json().code, "MEDIA_REJECTED", "extension and Content-Type are ignored");
  } finally {
    await t.close();
  }
});

test("preview: the console gets a signed link; the site reads drafts only with it", async () => {
  const t = await testApp({ ...env(), SITE_URL: "https://site.test" }, { seed: true });
  try {
    const op = await signIn(t.app, t, "operator");
    const e = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/page.printing", headers: { cookie: op.cookie } })).json();
    await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/page.printing", headers: as(op), payload: { base_revision_id: e.draft.id, ops: [{ path: "/hero/title@en", value: "Draft title" }] } });
    const link = await t.app.inject({ method: "POST", url: "/v1/manage/preview", headers: as(op), payload: { type: "page.printing", locale: "en" } });
    assert.equal(link.statusCode, 200, link.body);
    const url = new URL(link.json().url);
    assert.equal(url.origin + url.pathname, "https://site.test/api/opex/preview");
    assert.equal(url.searchParams.get("path"), "/en/printing");
    const tok = url.searchParams.get("token")!;

    const preview = (h: Record<string, string>) => t.app.inject({ method: "GET", url: "/v1/delivery/preview", headers: { ...bearer, ...h } });
    const ok = await preview({ "opex-preview": tok });
    assert.equal(ok.statusCode, 200);
    assert.equal(getAt(ok.json().entries["page.printing"].data, "/hero/title@en"), "Draft title");
    // Tamper inside the signature (the last base64url character carries padding bits, so changing only
    // the tail can leave the decoded signature unchanged and make this check flaky).
    const sig = tok.lastIndexOf(".") + 5;
    const forged = tok.slice(0, sig) + (tok[sig] === "A" ? "B" : "A") + tok.slice(sig + 1);
    assert.equal((await preview({ "opex-preview": forged })).statusCode, 401);
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/delivery/preview", headers: { "opex-preview": tok } })).statusCode, 401, "the delivery token is still required");
    // Published content is unchanged.
    const live = await t.app.inject({ method: "GET", url: "/v1/delivery/content/page.printing", headers: bearer });
    assert.equal(getAt(live.json().data, "/hero/title@en"), "ARAPOUSH Tube Printing Technologies");
  } finally {
    await t.close();
  }
});

test("locked fields: super admins are asked to confirm (STEP_UP_REQUIRED), then the edit goes through", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const admin = await signIn(t.app, t, "super_admin");
    // Age the sign-in so it no longer counts as a fresh confirmation.
    await t.db.q(`UPDATE sessions SET step_up_at = clock_timestamp() - interval '10 minutes'`);
    const e = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.effervescent.page", headers: { cookie: admin.cookie } })).json();
    const op = { base_revision_id: e.draft.id, ops: [{ path: "/data/caps/variants[id=spiral]/parts[id=cap]/y", value: 0.15 }] };
    const first = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(admin), payload: op });
    assert.equal(first.json().code, "STEP_UP_REQUIRED");
    await stepUp(t.app, admin);
    const again = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(admin), payload: op });
    assert.equal(again.statusCode, 200, again.body);
  } finally {
    await t.close();
  }
});
