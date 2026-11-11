import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testApp, signIn } from "../testing.ts";
import { exportArchive, verifyArchive } from "../audit/archive.ts";
import { signingKeys } from "../oauth/keys.ts";

test("write-once audit archive: signed manifest, read-only files, tampering detected, incremental", async () => {
  const t = await testApp();
  const dir = mkdtempSync(path.join(tmpdir(), "opex-archive-"));
  try {
    await signIn(t.app, t);
    const m = await exportArchive({ config: t.config, db: t.db }, dir, 0);
    assert.ok(m && m.count >= 3);
    const jwks = (await signingKeys(t.config, { memory: true })).publicJwks;
    const file = path.join(dir, m!.file);
    assert.deepEqual(await verifyArchive(file, jwks).then((r) => r.ok), true);
    // Files are read-only and never overwritten (a second run only takes new rows).
    assert.throws(() => writeFileSync(file, "x", { flag: "w" }));
    await signIn(t.app, t);
    const m2 = await exportArchive({ config: t.config, db: t.db }, dir, 0);
    assert.equal(m2!.from, m!.to + 1, "continues right after the previous archive (whose own audit row comes next)");
    assert.equal(readdirSync(dir).filter((f) => f.endsWith(".jsonl")).length, 2);

    // An attacker who rewrites an archived row (even with write access) is caught.
    chmodSync(file, 0o644);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const row = JSON.parse(lines[1]!);
    row.actor.display = "Someone else";
    lines[1] = JSON.stringify(row);
    writeFileSync(file, lines.join("\n") + "\n");
    const bad = await verifyArchive(file, jwks);
    assert.equal(bad.ok, false);
    assert.match(bad.reason!, /digest/);
    // …and a forged manifest needs OPEX's private key.
    const other = { keys: [{ ...jwks.keys[0]!, x: jwks.keys[0]!.y, y: jwks.keys[0]!.x }] };
    assert.equal((await verifyArchive(path.join(dir, m2!.file), other as never)).ok, false);
  } finally {
    await t.close();
  }
});

test("metrics need the token and report queue sizes and chain health", async () => {
  const token = "metrics-token-0123456789abcdef";
  const t = await testApp({ METRICS_TOKEN: token });
  try {
    assert.equal((await t.app.inject({ method: "GET", url: "/metrics" })).statusCode, 401);
    assert.equal((await t.app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer wrong-token-0123456789abcd" } })).statusCode, 401);
    const r = await t.app.inject({ method: "GET", url: "/metrics", headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /^opex_audit_chain_ok 1$/m);
    assert.match(r.body, /^opex_cr_pending_review 0$/m);
    const off = await testApp();
    assert.equal((await off.app.inject({ method: "GET", url: "/metrics" })).statusCode, 404, "off without a token");
    await off.close();
  } finally {
    await t.close();
  }
});
