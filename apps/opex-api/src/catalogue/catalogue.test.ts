import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { as, signIn, stepUp, testApp } from "../testing.ts";
import { readXlsx } from "./xlsx.ts";

const fixture = (name: string) => ({ name: `${name}.xlsx`, data: readFileSync(new URL(`./fixtures/${name}.xlsx`, import.meta.url)).toString("base64") });
const URL_ = "/v1/manage/catalogue/tube/import";

test("the xlsx reader returns the chart grid (shared strings, numbers, first sheet)", () => {
  const grid = readXlsx(readFileSync(new URL("./fixtures/oval.xlsx", import.meta.url)));
  const head = grid.findIndex((r) => r?.some((c) => c !== null));
  assert.equal(grid[head]![1], "بیضی");
  assert.deepEqual(grid[head + 1]!.slice(2, 6), [30, 72, 20, "اووال پیچی"]);
  assert.throws(() => readXlsx(new TextEncoder().encode("not a zip")), /NOT_XLSX/);
});

test("chart import: preview, apply as a draft, idempotent, guarded", async () => {
  const t = await testApp({ DELIVERY_TOKEN: "test-delivery-token-0123456789abcdef" }, { seed: true });
  try {
    const op = await signIn(t.app, t, "operator");
    const entry = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json();
    const data = structuredClone(entry.draft.data);
    // Someone edited the draft by hand: a wrong volume and a cap that does not fit oval Ø50.
    data.shapes.find((s: { id: string }) => s.id === "oval").sizes["50"][0].ml = 999;
    data.closures.find((c: { id: string }) => c.id === "ovalScrew").compat.oval["50"] = "chart";
    const saved = await t.app.inject({ method: "PUT", url: "/v1/manage/entries/product.tube.catalogue", headers: as(op), payload: { data, base_revision_id: entry.draft.id } });
    assert.equal(saved.statusCode, 200, saved.body);
    const base = saved.json().revision.id;

    // Preview: the chart puts both back and says what it would change; nothing is saved.
    const preview = await t.app.inject({ method: "POST", url: URL_, headers: as(op), payload: { files: [fixture("oval")] } });
    assert.equal(preview.statusCode, 200, preview.body);
    const p = preview.json();
    assert.deepEqual(p.charts[0], { file: "oval.xlsx", shape: "oval", diameters: [30, 35, 40, 50], sizes: 31, closures: ["اووال پیچی", "سوپر اووال", "اووال نازل چشمی", "اووال فیلیپ تاپ پیچی", "اووال  موشکی".replace(/\s+/g, " ")] });
    assert.ok(p.changes.some((c: { path: string; new: unknown }) => c.path.endsWith("/sizes/50[0]/ml") && c.new === 100));
    assert.ok(p.changes.some((c: { path: string; op: string }) => c.path.includes("closures[id=ovalScrew]/compat/oval/50") && c.op === "remove"));
    assert.ok(p.warnings.some((w: string) => w.includes("twice")), "the duplicated colour in the chart is flagged");
    assert.equal(p.revision, null);
    assert.equal(p.base_revision_id, base);

    // Applying against a stale draft is refused.
    const stale = await t.app.inject({ method: "POST", url: URL_, headers: as(op), payload: { files: [fixture("oval")], apply: true, base_revision_id: entry.draft.id } });
    assert.equal(stale.statusCode, 412);

    const applied = await t.app.inject({ method: "POST", url: URL_, headers: as(op), payload: { files: [fixture("oval"), fixture("round")], apply: true, base_revision_id: base } });
    assert.equal(applied.statusCode, 200, applied.body);
    assert.ok(applied.json().revision);
    const after = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json().draft.data;
    assert.equal(after.shapes.find((s: { id: string }) => s.id === "oval").sizes["50"][0].ml, 100);
    assert.deepEqual(after.closures.find((c: { id: string }) => c.id === "airless").colours.circular["30"], ["white", "metallicSilver"]);

    // Importing the same charts again changes nothing.
    const again = await t.app.inject({ method: "POST", url: URL_, headers: as(op), payload: { files: [fixture("oval"), fixture("round")] } });
    assert.deepEqual(again.json().changes, []);

    // A catalogue from before v3 (closures without chart wordings) is upgraded, not duplicated.
    const now = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json().draft;
    const v2 = { ...structuredClone(now.data), version: 2 };
    for (const c of v2.closures) delete c.aliases;
    v2.samples[0].shape = "eyeNozzle";
    // (Setting up the old shape touches a locked field: a super admin with a fresh second factor.)
    const admin = await signIn(t.app, t, "super_admin");
    await stepUp(t.app, admin);
    const old = await t.app.inject({ method: "PUT", url: "/v1/manage/entries/product.tube.catalogue", headers: as(admin), payload: { data: v2, base_revision_id: now.id } });
    assert.equal(old.statusCode, 200, old.body);
    const upRes = await t.app.inject({ method: "POST", url: URL_, headers: as(op), payload: { files: [fixture("round")] } });
    assert.equal(upRes.statusCode, 200, upRes.body);
    const up = upRes.json();
    assert.deepEqual(up.added, []);
    assert.ok(up.warnings[0].includes("upgraded to v3"));
    assert.ok(up.changes.some((c: { path: string; new: unknown }) => c.path === "/samples[id=printed-flip-top]/shape" && c.new === "circular"));

    // Something that is not a chart.
    const junk = await t.app.inject({ method: "POST", url: URL_, headers: as(op), payload: { files: [{ name: "notes.xlsx", data: Buffer.from("hello").toString("base64") }] } });
    assert.equal(junk.statusCode, 400);
    assert.equal(junk.json().code, "NO_CHART");

    // Viewers can look but not import.
    const viewer = await signIn(t.app, t, "viewer");
    assert.equal((await t.app.inject({ method: "POST", url: URL_, headers: as(viewer), payload: { files: [fixture("oval")] } })).statusCode, 403);
  } finally {
    await t.close();
  }
});

test("closure models: STEP converted to GLB, reviewed, mounted, approved into the catalogue draft", async () => {
  const t = await testApp({ DELIVERY_TOKEN: "test-delivery-token-0123456789abcdef", MEDIA_DIR: mkdtempSync(path.join(tmpdir(), "opex-media-")) }, { seed: true });
  try {
    const op = await signIn(t.app, t, "operator");
    const M = "/v1/manage/catalogue/tube/models";
    // A conical surface from the OpenCascade importer's own test files: a cap-like solid.
    const step = readFileSync(new URL("../../../../node_modules/occt-import-js/test/testfiles/conical-surface/conical-surface.step", import.meta.url)).toString("base64");

    assert.equal((await t.app.inject({ method: "POST", url: M, headers: as(op), payload: { closure: "nope", name: "x.step", data: step } })).statusCode, 404);
    const junk = await t.app.inject({ method: "POST", url: M, headers: as(op), payload: { closure: "conical", name: "x.step", data: Buffer.from("not cad at all").toString("base64") } });
    assert.equal(junk.statusCode, 400);
    assert.equal(junk.json().code, "CAD_REJECTED");

    const up = await t.app.inject({ method: "POST", url: M, headers: as(op), payload: { closure: "conical", name: "conical.step", data: step } });
    assert.equal(up.statusCode, 201, up.body);
    const m = up.json();
    assert.equal(m.status, "needs_review");
    assert.equal(m.source_kind, "step");
    assert.deepEqual(m.bbox.size.map(Math.round), [7, 27, 27]);
    assert.equal(m.mounting, null);
    const glb = await t.app.inject({ method: "GET", url: m.url, headers: { cookie: op.cookie } });
    assert.equal(glb.statusCode, 200);
    assert.equal(glb.rawPayload.subarray(0, 4).toString("latin1"), "glTF");

    const list = (await t.app.inject({ method: "GET", url: `${M}?closure=conical`, headers: { cookie: op.cookie } })).json();
    assert.equal(list[0].id, m.id);

    const entry = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json();
    // Never placed by guess: approval needs the mounting.
    const early = await t.app.inject({ method: "POST", url: `${M}/${m.id}/approve`, headers: as(op), payload: { base_revision_id: entry.draft.id } });
    assert.equal(early.statusCode, 400);
    assert.equal(early.json().code, "MOUNTING_REQUIRED");

    const mounting = { axis: "+X", anchorMm: [0, 0, 0], neckDiameterMm: 13.5, thread: "M13" };
    const set = await t.app.inject({ method: "PUT", url: `${M}/${m.id}/mounting`, headers: as(op), payload: mounting });
    assert.equal(set.statusCode, 200, set.body);
    assert.deepEqual(set.json().mounting, mounting);

    assert.equal((await t.app.inject({ method: "POST", url: `${M}/${m.id}/approve`, headers: as(op), payload: { base_revision_id: null } })).statusCode, 412);
    const ok = await t.app.inject({ method: "POST", url: `${M}/${m.id}/approve`, headers: as(op), payload: { base_revision_id: entry.draft.id } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().model.status, "approved");
    const draft = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json().draft.data;
    const conical = draft.closures.find((c: { id: string }) => c.id === "conical");
    assert.equal(conical.model3d.axis, "+X");
    assert.match(conical.model3d.src, /^\/media\/ast_[0-9A-Z]{26}\.glb$/);
    assert.equal(conical.model, "param", "the parametric shape stays as the fallback");

    // Published, the GLB becomes public like any other media.
    const file = conical.model3d.src.slice("/media/".length);
    assert.equal((await t.app.inject({ method: "GET", url: `/media/${file}` })).statusCode, 404);
    const pub = await t.app.inject({ method: "POST", url: "/v1/manage/entries/product.tube.catalogue/publish", headers: as(op), payload: {} });
    assert.equal(pub.statusCode, 200, pub.body);
    assert.equal((await t.app.inject({ method: "GET", url: `/media/${file}` })).statusCode, 200);

    // A model made for one diameter: used only there, beside the closure's general model.
    const pair = await t.app.inject({ method: "POST", url: M, headers: as(op), payload: { closure: "conical", diameter: 30, name: "x.step", data: step } });
    assert.equal(pair.statusCode, 400);
    assert.equal(pair.json().code, "VALIDATION_FAILED");
    assert.equal((await t.app.inject({ method: "POST", url: M, headers: as(op), payload: { closure: "conical", shape: "circular", diameter: 99, name: "x.step", data: step } })).statusCode, 400);
    const at30 = await t.app.inject({ method: "POST", url: M, headers: as(op), payload: { closure: "conical", shape: "circular", diameter: 30, name: "conical-30.step", data: step } });
    assert.equal(at30.statusCode, 201, at30.body);
    const m30 = at30.json();
    assert.equal(m30.shape, "circular");
    assert.equal(m30.diameter, 30);
    assert.ok("suggested" in m30);
    assert.equal((await t.app.inject({ method: "PUT", url: `${M}/${m30.id}/mounting`, headers: as(op), payload: mounting })).statusCode, 200);
    const base = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json().draft.id;
    const ok30 = await t.app.inject({ method: "POST", url: `${M}/${m30.id}/approve`, headers: as(op), payload: { base_revision_id: base } });
    assert.equal(ok30.statusCode, 200, ok30.body);
    const after = (await t.app.inject({ method: "GET", url: "/v1/manage/entries/product.tube.catalogue", headers: { cookie: op.cookie } })).json().draft.data;
    const c2 = after.closures.find((c: { id: string }) => c.id === "conical");
    assert.equal(c2.models3d.circular["30"].modelId, m30.id);
    assert.equal(c2.model3d.modelId, m.id, "the general model stays");
    const models = (await t.app.inject({ method: "GET", url: `${M}?closure=conical`, headers: { cookie: op.cookie } })).json();
    assert.equal(models.find((x: { id: string }) => x.id === m.id).status, "approved", "a per-diameter approval archives nothing else");

    // Viewers can list but not upload.
    const viewer = await signIn(t.app, t, "viewer");
    assert.equal((await t.app.inject({ method: "POST", url: M, headers: as(viewer), payload: { closure: "conical", name: "x.step", data: step } })).statusCode, 403);
  } finally {
    await t.close();
  }
});
