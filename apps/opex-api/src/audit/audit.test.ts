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
