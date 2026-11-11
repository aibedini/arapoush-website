import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getAt } from "@arapoush/schema";
import { testApp, signIn, stepUp, as } from "../testing.ts";
import { touchesRender } from "./routes.ts";

const RT = "renderer-token-0123456789abcdef";
const env = () => ({ RENDER_TOKEN: RT, MEDIA_DIR: mkdtempSync(path.join(tmpdir(), "opex-media-")) });
const bot = { authorization: `Bearer ${RT}` };
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 120, b: 40, alpha: 0.5 } } }).png().toBuffer();

test("render trigger: geometry changes only", () => {
  const t = (path: string) => touchesRender([{ op: "replace", path }]);
  assert.equal(t("/data/sizes[id=27x175]/h"), true);
  assert.equal(t("/data/sizes[id=30x200]"), true, "a size added or removed");
  assert.equal(t("/data/caps/variants[id=matte]"), true);
  assert.equal(t("/data/renderPxPerMm"), true);
  assert.equal(t("/data/sizes[id=27x175]/render/base"), false, "the renderer's own output");
  assert.equal(t("/data/caps/variants[id=spiral]/parts[id=cap]/y"), false, "marker positions");
  assert.equal(t("/data/caps/variants[id=spiral]/photo"), false);
  assert.equal(t("/productEff/title@en"), false);
});

test("a size change queues a render; the renderer claims it, uploads images and the draft gets the results", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const admin = await signIn(t.app, t, "super_admin");
    await stepUp(t.app, admin);
    const draft = async () => (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.effervescent.page", headers: { cookie: admin.cookie } })).json().draft;
    // Moving a cap marker does not queue anything.
    const d0 = await draft();
    await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(admin), payload: { base_revision_id: d0.id, ops: [{ path: "/data/caps/variants[id=spiral]/parts[id=cap]/y", value: 0.17 }] } });
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/manage/render/jobs", headers: { cookie: admin.cookie } })).json().length, 0);

    // A taller 27 mm tube does.
    const d1 = await draft();
    const edit = await t.app.inject({ method: "PATCH", url: "/v1/manage/entries/product.effervescent.page", headers: as(admin), payload: { base_revision_id: d1.id, ops: [{ path: "/data/sizes[id=27x175]/h", value: 180 }] } });
    assert.equal(edit.statusCode, 200, edit.body);
    const jobs = (await t.app.inject({ method: "GET", url: "/v1/manage/render/jobs", headers: { cookie: admin.cookie } })).json();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, "pending");

    assert.equal((await t.app.inject({ method: "POST", url: "/v1/render/claim" })).statusCode, 401, "renderer token required");
    const claim = await t.app.inject({ method: "POST", url: "/v1/render/claim", headers: bot });
    assert.equal(claim.statusCode, 200, claim.body);
    const job = claim.json();
    assert.equal(job.input.sizes.find((s: { id: string }) => s.id === "27x175").h, 180);
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/render/claim", headers: bot })).statusCode, 204, "nothing else to do");

    const upload = async (name: string, w: number, h: number) => {
      const r = await t.app.inject({ method: "POST", url: `/v1/render/jobs/${job.id}/assets`, headers: { ...bot, "content-type": "application/octet-stream", "x-filename": name }, payload: await png(w, h) });
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const sizes = [];
    for (const s of job.input.sizes) {
      const a = await upload(`size-${s.id}.png`, 40, s.h * 2);
      sizes.push({ id: s.id, asset: a.asset, width: a.width, height: a.height, base: s.h * 2 - 4, mouth: 6, left: 2, right: 38 });
    }
    const caps = [];
    for (const id of job.input.caps) {
      const a = await upload(`cap-${id}.png`, 30, 90);
      caps.push({ id, asset: a.asset, width: a.width, height: a.height });
    }
    const wide = await upload("hero-wide-ltr.png", 160, 100);
    const done = await t.app.inject({
      method: "POST",
      url: `/v1/render/jobs/${job.id}/complete`,
      headers: bot,
      payload: { sizes, caps, posters: { "wide-ltr": { asset: wide.asset, width: 160, height: 100 } } },
    });
    assert.equal(done.statusCode, 200, done.body);

    const d2 = await draft();
    const render = getAt(d2.data, "/data/sizes[id=27x175]/render") as { src: string; height: number; base: number };
    assert.match(render.src, /^\/media\/ast_[0-9A-Z]{26}\.webp$/);
    assert.equal(render.height, 360);
    assert.equal(render.base, 356);
    assert.equal(getAt(d2.data, "/data/sizes[id=27x175]/h"), 180, "the operator's edit is kept");
    assert.match(String(getAt(d2.data, "/data/images/posters/wide-ltr/src")), /^\/media\//);
    assert.match(String(getAt(d2.data, "/data/caps/variants[id=spiral]/image/src")), /^\/media\//);
    const revs = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.effervescent.page/revisions", headers: { cookie: admin.cookie } })).json();
    assert.equal(revs[0].author, null, "written by the renderer service, not a person");
    assert.match(revs[0].note, /3D renders/);
    const acts = (await t.db.q<{ action: string }>(`SELECT action FROM audit_events ORDER BY seq`)).map((r) => r.action);
    for (const a of ["render.queued", "render.started", "render.completed"]) assert.ok(acts.includes(a), a);
    // The finished job cannot be completed twice.
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/render/jobs/${job.id}/complete`, headers: bot, payload: { sizes, caps } })).statusCode, 409);
  } finally {
    await t.close();
  }
});

test("renderer results may only use the renderer's own uploads; failures retry, then stop", async () => {
  const t = await testApp(env(), { seed: true });
  try {
    const admin = await signIn(t.app, t, "super_admin");
    await stepUp(t.app, admin);
    // Manual queue (operators can re-render without changing anything).
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/manage/render", headers: as(admin), payload: {} })).statusCode, 200);
    const op = await signIn(t.app, t, "operator");
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/manage/render", headers: as(op), payload: {} })).statusCode, 403, "super admins only");

    const job = (await t.app.inject({ method: "POST", url: "/v1/render/claim", headers: bot })).json();
    // An operator-uploaded asset is not accepted as a render.
    const boundary = "----x";
    const file = await png(10, 10);
    const up = await t.app.inject({ method: "POST", url: "/v1/manage/media", headers: { ...as(admin), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`), file, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    const foreign = await t.app.inject({ method: "POST", url: `/v1/render/jobs/${job.id}/complete`, headers: bot, payload: { sizes: [{ id: "27x175", asset: up.json().id, width: 10, height: 10, base: 1, mouth: 1, left: 1, right: 1 }], caps: [] } });
    assert.equal(foreign.json().code, "UNKNOWN_ASSET");

    for (let i = 1; i <= 3; i++) {
      if (i > 1) assert.equal((await t.app.inject({ method: "POST", url: "/v1/render/claim", headers: bot })).statusCode, 200);
      await t.app.inject({ method: "POST", url: `/v1/render/jobs/${job.id}/fail`, headers: bot, payload: { error: "WebGL context lost" } });
    }
    const [row] = await t.db.q<{ status: string; attempts: number }>(`SELECT status, attempts FROM render_jobs WHERE id = $1`, [job.id]);
    assert.deepEqual(row, { status: "failed", attempts: 3 });
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/render/claim", headers: bot })).statusCode, 204);
    // A newer queue supersedes older pending jobs.
    await t.app.inject({ method: "POST", url: "/v1/manage/render", headers: as(admin), payload: {} });
    await t.app.inject({ method: "POST", url: "/v1/manage/render", headers: as(admin), payload: {} });
    const statuses = (await t.db.q<{ status: string }>(`SELECT status FROM render_jobs ORDER BY created_at`)).map((r) => r.status);
    assert.deepEqual(statuses, ["failed", "superseded", "pending"]);
  } finally {
    await t.close();
  }
});
