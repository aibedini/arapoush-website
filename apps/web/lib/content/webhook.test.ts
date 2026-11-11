import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { replayCache, verifySignature } from "./webhook.ts";

const secret = "test-webhook-secret-0123456789";
const sign = (body: string, t: number, key = secret) => `t=${t}, v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
const now = 1_800_000_000_000;
const t = now / 1000;

test("only a correctly signed, recent body is accepted", () => {
  const body = '{"id":"evt_1"}';
  const good = sign(body, t);
  assert.equal(verifySignature(secret, good, body, now), true);
  // Every single-digit change of the MAC is refused.
  const mac = good.slice(-64);
  for (let i = 0; i < 64; i++) {
    const flipped = mac.slice(0, i) + (mac[i] === "0" ? "1" : "0") + mac.slice(i + 1);
    assert.equal(verifySignature(secret, good.slice(0, -64) + flipped, body, now), false);
  }
  assert.equal(verifySignature(secret, good, body + " ", now), false, "body changed");
  assert.equal(verifySignature(secret, sign(body, t, "another-secret-0123456789abcd"), body, now), false, "wrong secret");
  assert.equal(verifySignature(secret, sign(body, t - 301), body, now), false, "too old");
  assert.equal(verifySignature(secret, sign(body, t + 301), body, now), false, "from the future");
  assert.equal(verifySignature(secret, null, body, now), false);
  assert.equal(verifySignature(secret, "t=1, v1=zz", body, now), false);
});

test("an event id is accepted once within the window", () => {
  const fresh = replayCache(1000);
  assert.equal(fresh("evt_a", 0), true);
  assert.equal(fresh("evt_a", 500), false);
  assert.equal(fresh("evt_b", 500), true);
  assert.equal(fresh("evt_a", 2000), true, "forgotten after the window");
});
