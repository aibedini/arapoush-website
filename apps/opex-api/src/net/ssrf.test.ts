import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, isPrivateAddress } from "./ssrf.ts";

test("internal addresses are refused for outgoing webhooks (S2)", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.30.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip);
  await assert.rejects(assertPublicUrl("https://127.0.0.1/hook"), /PRIVATE_ADDRESS/);
  await assert.rejects(assertPublicUrl("https://[::1]/hook"), /PRIVATE_ADDRESS/);
});
