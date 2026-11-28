import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSize, labelKind, looksLikePdf } from "./label.ts";

test("label formats: images directly, PDF and Illustrator through pdf.js, nothing else", () => {
  assert.equal(labelKind("Label.PNG"), "image");
  assert.equal(labelKind("art.jpeg"), "image");
  assert.equal(labelKind("logo.svg"), "image");
  assert.equal(labelKind("print.pdf"), "pdf");
  assert.equal(labelKind("design.ai"), "pdf");
  assert.equal(labelKind("noext", "application/pdf"), "pdf");
  assert.equal(labelKind("photo", "image/webp"), "image");
  assert.equal(labelKind("cap.step"), null);
  assert.equal(labelKind("design.psd"), null);
});

test("an Illustrator file is readable only with its PDF part", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  assert.equal(looksLikePdf(enc("%PDF-1.6\n%âãÏÓ")), true);
  assert.equal(looksLikePdf(enc("%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator")), false);
});

test("artwork is capped at 2048 px on its longest side, keeping its aspect", () => {
  assert.deepEqual(fitSize(4096, 1024), { width: 2048, height: 512 });
  assert.deepEqual(fitSize(1000, 3000), { width: 683, height: 2048 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});
