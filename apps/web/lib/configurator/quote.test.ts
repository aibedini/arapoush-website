import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_QUOTE, quoteMailto, validateQuote } from "./quote.ts";

test("name and email are required", () => {
  assert.deepEqual(validateQuote(EMPTY_QUOTE), { name: "required", email: "required" });
});

test("email must look like an address; quantity must be numeric", () => {
  const e = validateQuote({ ...EMPTY_QUOTE, name: "Sara", email: "sara@", quantity: "lots" });
  assert.deepEqual(e, { email: "invalid", quantity: "invalid" });
  assert.deepEqual(validateQuote({ ...EMPTY_QUOTE, name: "Sara", email: "sara@brand.ir", quantity: "20,000" }), {});
});

test("mailto carries the configuration and cannot inject headers", () => {
  const href = quoteMailto({
    to: "sales@arapoush.com",
    subject: "Quote — Ø30 × 110 mm",
    spec: ["Circular Ø30 × 110 mm", "Flip-top cap", "50 ml (indicative)"],
    fields: [
      ["Name", "Sara"],
      ["Company", "Acme&cc=evil@x.com"],
      ["Phone", "  "],
    ],
    link: "https://arapoush.com/en/products/multi-layer-tube?shape=circular&d=30&l=110&cap=flipTop",
  });
  assert.ok(href.startsWith("mailto:sales@arapoush.com?subject="));
  const url = new URL(href);
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
  const body = url.searchParams.get("body")!;
  assert.match(body, /Circular Ø30 × 110 mm/);
  assert.match(body, /Company: Acme&cc=evil@x.com/);
  assert.doesNotMatch(body, /Phone:/);
  assert.match(body, /d=30&l=110/);
});
