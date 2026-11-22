import { test } from "node:test";
import assert from "node:assert/strict";
import type { GroupField } from "./fields.ts";
import { applyTranslations, coverage, inScope, localizedLeaves, needsTranslation } from "./translate.ts";

const schema: GroupField = {
  kind: "group",
  fields: {
    title: { kind: "text", localized: true, max: 20 },
    code: { kind: "text", localized: false },
    geometry: { kind: "group", locked: true, fields: { label: { kind: "text", localized: true } } },
    photo: { kind: "image" },
    slides: { kind: "list", key: "id", of: { kind: "group", fields: { id: { kind: "text", localized: false }, lead: { kind: "text", localized: true } } } },
  },
};
const data = {
  title: { fa: "سلام", en: "Hello" },
  code: "X1",
  geometry: { label: { fa: "قفل" } },
  photo: { src: "/images/a.jpg", alt: { fa: "عکس" } },
  slides: [{ id: "a", lead: { fa: "اول" } }, { id: "b", lead: { fa: "دوم", tr: "İkinci" } }],
};

test("translate helpers: leaves follow the schema, skip locked parts, respect scope and limits", () => {
  const leaves = localizedLeaves(schema, data);
  assert.deepEqual(leaves.map((l) => l.path), ["/title", "/photo/alt", "/slides[id=a]/lead", "/slides[id=b]/lead"]);
  assert.deepEqual(localizedLeaves(schema, data, "/slides[id=b]").map((l) => l.path), ["/slides[id=b]/lead"]);
  assert.equal(inScope("/slides[id=a]/lead", "/slides"), true);
  assert.equal(inScope("/slidesX", "/slides"), false);
  assert.equal(needsTranslation(data.slides[1]!.lead, "fa", "tr", "missing"), false);
  assert.equal(needsTranslation(data.slides[1]!.lead, "fa", "tr", "all"), true);
  assert.deepEqual(coverage(schema, data), { total: 4, filled: { fa: 4, en: 1, tr: 1 } });

  const done = new Map([
    ["/title", { source: "سلام", out: { tr: "Merhaba", en: "A very long hello that does not fit" } }],
    ["/slides[id=a]/lead", { source: "تغییر کرده", out: { en: "First" } }], // source changed since: skipped
    ["/photo/alt", { source: "عکس", out: { en: "Photo" } }],
  ]);
  const { data: next, written } = applyTranslations(schema, data, "fa", done as never);
  assert.equal(written, 2);
  const n = next as typeof data & { title: Record<string, string>; photo: { alt: Record<string, string> } };
  assert.deepEqual(n.title, { fa: "سلام", en: "Hello", tr: "Merhaba" });
  assert.equal(n.photo.alt.en, "Photo");
  assert.deepEqual(n.slides[0]!.lead, { fa: "اول" });
  assert.equal(n.code, "X1");
});
