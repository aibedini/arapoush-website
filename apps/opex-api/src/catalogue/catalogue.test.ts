import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
