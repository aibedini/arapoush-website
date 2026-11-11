import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickLocale } from "@arapoush/schema";
import { overlay } from "./overlay.ts";

const seed = JSON.parse(readFileSync(new URL("../../../../packages/schema/src/generated/seed.json", import.meta.url), "utf8"));

test("content overrides code copy key by key; unknown keys and wrong types are ignored", () => {
  const base = { meta: { title: "Code", description: "Desc" }, list: ["a", "b"], n: 1 };
  const out = overlay(base, { meta: { title: "From OPEX", extra: "x" }, list: ["c"], n: "oops", other: 5 });
  assert.deepEqual(out, { meta: { title: "From OPEX", description: "Desc" }, list: ["c"], n: 1 });
  assert.equal(overlay(base, undefined), base);
  assert.deepEqual(overlay({ list: ["a"] }, { list: { 0: "x" } }), { list: ["a"] });
});

test("the snapshot carries every image the site used to hard-code, with Persian variants picked", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON fixture
  const img = (type: string, locale: "fa" | "en") => pickLocale<{ images: Record<string, any> }>(seed[type], locale).images;
  assert.equal(img("global.site", "fa").ctaTube.src, "/images/fa/cta-tube.webp");
  assert.equal(img("global.site", "en").ctaTube.src, "/images/cta-tube.webp");
  assert.equal(img("page.home.partners", "fa").background.src, "/images/fa/partners-bg.webp");
  assert.deepEqual(img("page.home.products", "en").cards.map((c: { id: string; image: { src: string } }) => [c.id, c.image.src]), [
    ["tube", "/images/product-tube.webp"],
    ["effervescent", "/images/product-effervescent.webp"],
  ]);
  const slides = img("page.home.hero", "fa").slides;
  assert.equal(slides[1].backgroundRtl.src, "/images/hero-packaging-rtl.webp");
  assert.equal(slides[1].backgroundMobile.src, "/images/hero-packaging-mobile.webp");
  for (const id of ["gmp", "iso", "ifda", "inso"]) assert.ok(img("page.home.certifications", "en").seals.some((s: { id: string }) => s.id === id));
  assert.equal(img("page.printing", "en").tubeGold.src, "/images/printing/tube-gold.webp");
});
