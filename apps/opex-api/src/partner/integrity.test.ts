import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contentDigest, signatureBase } from "./integrity.ts";
import { sign } from "../webhooks/outbox.ts";

// The PHP reference client's tests use these vectors; the server must still produce them exactly.
const v = JSON.parse(readFileSync(new URL("../../../../clients/php-reference/tests/vectors.json", import.meta.url), "utf8"));

test("cross-language vectors: signature base, content digest and webhook signature", () => {
  assert.equal(contentDigest(v.body), v.headers["content-digest"]);
  assert.equal(signatureBase({ method: "POST", path: "/v1/partner/change-requests", headers: v.headers }, v.components, v.params), v.base);
  assert.equal(sign(v.webhook.secret, v.webhook.body, v.webhook.t), v.webhook.header);
});
