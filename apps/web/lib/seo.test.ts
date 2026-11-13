import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonLdHtml } from "./jsonld.ts";

test("JSON-LD can never close its script tag (S2)", () => {
  const html = jsonLdHtml({ name: "</script><script>alert(1)</script>", a: "x & y > z" });
  assert.ok(!html.includes("<") && !html.includes(">") && !html.includes("&"));
  assert.deepEqual(JSON.parse(html), { name: "</script><script>alert(1)</script>", a: "x & y > z" });
});
