import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "./generated/seed.json" with { type: "json" };
import { contentType } from "./index.ts";
import { validate } from "./validate.ts";
import { atDevice, newLayer, newSlide, safeColour, sliderOf, SLIDER_FIELD, LAYER_KINDS } from "./slider.ts";
import { fontCss, fontStack } from "./fonts.ts";

const hero = (seed as Record<string, unknown>)["page.home.hero"] as Parameters<typeof sliderOf>[0];

test("the designed hero reads into the slider model and validates", () => {
  const s = sliderOf(hero);
  assert.equal(s.slides?.length, 4);
  assert.deepEqual(s.slides?.map((x) => x.key), ["products", "packaging", "tube", "partners"]);
  const packaging = s.slides![1]!;
  assert.equal(packaging.background?.mirrorRtl, false);
  assert.equal(packaging.mark?.hidden, true);
  assert.equal(packaging.background?.mobile?.image?.src, "/images/hero-packaging-mobile.webp");
  assert.equal(packaging.background?.imageRtl?.src, "/images/hero-packaging-rtl.webp");
  assert.equal(s.slides![0]!.copy?.title?.fa, "بسته‌بندی،\nاز نو.");
  assert.equal(s.slides![3]!.product?.hidden, true);
  const t = contentType("page.home.hero")!;
  const { issues } = validate(t.schema, { ...(hero as object), slider: s });
  assert.deepEqual(issues, []);
});

test("a stored slider wins over the designed one", () => {
  const slider = { slides: [newSlide("only")] };
  assert.equal(sliderOf({ ...(hero as object), slider }).slides?.[0]?.key, "only");
});

test("new slides and every layer kind validate", () => {
  const slide = { ...newSlide("a"), layers: LAYER_KINDS.map((k) => newLayer(k, `l-${k}`)) };
  const { issues } = validate(SLIDER_FIELD, { slides: [slide] });
  assert.deepEqual(issues, []);
});

test("responsive values cascade desktop → tablet → mobile", () => {
  const v = { color: "#000", x: 10, tablet: { x: 20 }, mobile: { color: "#fff", x: undefined } };
  assert.deepEqual(atDevice(v, "desktop"), { color: "#000", x: 10 });
  assert.deepEqual(atDevice(v, "tablet"), { color: "#000", x: 20 });
  assert.deepEqual(atDevice(v, "mobile"), { color: "#fff", x: 20 });
});

test("colours are the only CSS content can reach", () => {
  assert.equal(safeColour("#0a274780"), "#0a274780");
  assert.equal(safeColour("rgba(10, 39, 71, 0.5)"), "rgba(10, 39, 71, 0.5)");
  assert.equal(safeColour("red;background:url(x)"), undefined);
  assert.equal(safeColour("#fff}body{display:none"), undefined);
});

test("font CSS: only used families, per language and per section, no self-reference", () => {
  const fonts = {
    families: [
      { key: "yekan", name: "Yekan", files: [{ src: "/media/ast_01HZZZZZZZZZZZZZZZZZZZZZZZ.woff2", weight: 400 }] },
      { key: "unused", name: "Unused", files: [{ src: "/media/ast_01HYYYYYYYYYYYYYYYYYYYYYYY.woff2" }] },
      { key: "evil", name: "Evil", files: [{ src: "/media/x.woff2);}body{display:none" }] },
    ],
    locales: { fa: { body: "yekan" } },
    sections: { products: "ui", "bad}": "yekan" },
  };
  const css = fontCss(fonts, "fa");
  assert.match(css, /@font-face\{font-family:"opex-yekan";src:url\(\/media\/ast_01HZZZZZZZZZZZZZZZZZZZZZZZ\.woff2\) format\("woff2"\)/);
  assert.doesNotMatch(css, /unused|evil|display:none|bad/);
  assert.match(css, /:root:lang\(fa\)\{--font-sans:"opex-yekan", var\(--font-vazir\)/);
  assert.match(css, /\[data-font-scope="products"\]\{--font-sans:var\(--font-ui\)\}/);
  assert.doesNotMatch(css, /--font-sans:[^;}]*var\(--font-sans\)/);
  assert.equal(fontCss(fonts, "en"), '[data-font-scope="products"]{--font-sans:var(--font-ui)}');
  assert.equal(fontStack("nope", fonts), undefined);
});
