import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTubeLayout } from "./layout.ts";

const file = JSON.parse(readFileSync(new URL("../../content/products/tube-layout.json", import.meta.url), "utf8"));

test("the default tube layout keeps every built-in section with its default style", () => {
  const l = normalizeTubeLayout(file.sections);
  assert.deepEqual(l.map((s) => [s.type, s.style ?? null]), [["hero", "media"], ["configurator", "viewerStart"], ["samples", "grid"], ["quote", null], ["structure", "split"], ["closing", null]]);
});

test("unknown types, duplicates and bad styles are cleaned; blocks keep their props", () => {
  const l = normalizeTubeLayout([
    { id: "hero", type: "hero", style: "neon" },
    { id: "hero", type: "hero" },
    { id: "x", type: "carousel3000" },
    { id: "faq-1", type: "faq", props: { title: { fa: "پرسش‌ها" } } },
    { id: "s", type: "samples", style: "rail", enabled: false },
  ]);
  assert.deepEqual(l.map((s) => s.id), ["hero", "configurator", "faq-1", "s"]);
  assert.equal(l[0]!.style, "media");
  assert.equal(l[2]!.props?.title?.fa, "پرسش‌ها");
  assert.deepEqual([l[3]!.style, l[3]!.enabled], ["rail", false]);
});
