import { test } from "node:test";
import assert from "node:assert/strict";
import { testApp } from "../testing.ts";
import { audit, auditNow, verifyChain, SYSTEM_ACTOR, SYSTEM_REQUEST } from "./audit.ts";

test("audit rows form a verifiable hash chain", async () => {
  const { db, close } = await testApp();
  try {
    for (let i = 0; i < 5; i++) await auditNow(db, "t1", { action: "test.event", actor: SYSTEM_ACTOR, request: SYSTEM_REQUEST, resource: { i }, changes: [{ op: "replace", path: "/x", old: i, new: i + 1 }] });
    const r = await verifyChain(db, "t1");
    assert.equal(r.ok, true);
    assert.equal(r.checked, 5);
    assert.equal((await verifyChain(db, "t1", 3)).ok, true, "a sub-range verifies from its predecessor");
  } finally {
    await close();
  }
});

test("audit rows cannot be updated, deleted or truncated", async () => {
  const { db, close } = await testApp();
  try {
    await auditNow(db, "t1", { action: "test.event", actor: SYSTEM_ACTOR, request: SYSTEM_REQUEST });
    await assert.rejects(db.q(`UPDATE audit_events SET action = 'x'`), /append-only/);
    await assert.rejects(db.q(`DELETE FROM audit_events`), /append-only/);
    await assert.rejects(db.q(`TRUNCATE audit_events`), /append-only/);
  } finally {
    await close();
  }
});

test("a tampered row breaks verification at that row", async () => {
  const { db, close } = await testApp();
  try {
    for (let i = 0; i < 4; i++) await auditNow(db, "t1", { action: "test.event", actor: SYSTEM_ACTOR, request: SYSTEM_REQUEST, resource: { i } });
    // Simulate an attacker with superuser rights bypassing the trigger.
    await db.q(`ALTER TABLE audit_events DISABLE TRIGGER audit_immutable`);
    await db.q(`UPDATE audit_events SET resource = '{"i":99}' WHERE seq = 3`);
    const r = await verifyChain(db, "t1");
    assert.equal(r.ok, false);
    assert.equal(r.firstBad, 3);
  } finally {
    await close();
  }
});

test("a failed business transaction leaves no audit row behind", async () => {
  const { db, close } = await testApp();
  try {
    await assert.rejects(
      db.tx(async (q) => {
        await audit(q, "t1", { action: "test.event", actor: SYSTEM_ACTOR, request: SYSTEM_REQUEST });
        throw new Error("business rule failed");
      }),
    );
    const [{ n }] = (await db.q<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events`)) as [{ n: number }];
    assert.equal(n, 0);
  } finally {
    await close();
  }
});

test("health and readiness answer, errors are problem+json with a request id", async () => {
  const { app, close } = await testApp();
  try {
    const h = await app.inject({ method: "GET", url: "/readyz" });
    assert.equal(h.statusCode, 200);
    assert.ok(h.headers["x-request-id"]);
    const nf = await app.inject({ method: "GET", url: "/nope" });
    assert.equal(nf.statusCode, 404);
    assert.match(String(nf.headers["content-type"]), /problem\+json/);
    assert.equal(nf.json().instance, nf.headers["x-request-id"]);
  } finally {
    await close();
  }
});

test("audit search filters by actor, ip and action; verify and export are audited", async () => {
  const { testApp, signIn, stepUp, as } = await import("../testing.ts");
  const t = await testApp();
  try {
    const op = await signIn(t.app, t, "super_admin");
    const q = (qs: string) => t.app.inject({ method: "GET", url: `/v1/manage/audit?${qs}`, headers: { cookie: op.cookie } });
    const logins = (await q("action=auth.*")).json();
    assert.ok(logins.length >= 2);
    assert.ok(logins.every((r: { action: string }) => r.action.startsWith("auth.")));
    assert.ok((await q("ip=127.0.0.1")).json().length > 0);
    assert.equal((await q("ip=10.9.9.9")).json().length, 0);
    assert.ok((await q("actor=Test%20Operator")).json().length > 0);
    const v = await t.app.inject({ method: "GET", url: "/v1/manage/audit/verify", headers: { cookie: op.cookie } });
    assert.equal(v.json().ok, true);
    await stepUp(t.app, op);
    const ex = await t.app.inject({ method: "GET", url: "/v1/manage/audit/export", headers: as(op) });
    assert.equal(ex.statusCode, 200);
    assert.ok(ex.body.trim().split("\n").length > 3);
    const actions = (await q("action=audit.*")).json().map((r: { action: string }) => r.action);
    assert.ok(actions.includes("audit.verify") && actions.includes("audit.export"));
    const dash = await t.app.inject({ method: "GET", url: "/v1/manage/dashboard", headers: { cookie: op.cookie } });
    assert.equal(dash.statusCode, 200);
    assert.ok(dash.json().recent.length > 0);
  } finally {
    await t.close();
  }
});
