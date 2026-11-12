import { test } from "node:test";
import assert from "node:assert/strict";
import { colourOf, mergeChart, parseChart, type ChartCatalogue, type Grid } from "./tubeChart.ts";
import { validate } from "./validate.ts";
import type { GroupField } from "./fields.ts";

// A chart in the Arapoush layout: Ø19 lists colours on its first row, Ø25 in a colour section.
const grid: Grid = [
  [null, "دایره", "قطر", "ارتفاع", "حجم", "نوع درب ها", null, "رنگ های قابل سفارش", null],
  [null, null, 19, 50, 5, "اسکرو", "بالم لب", "سفید", "متالایز\n(نقره ای-طلایی)"],
  [null, null, null, 65, 10, null, null, null, null],
  [null, "دایره", "قطر", "ارتفاع", "حجم", "نوع درب ها", null, null, null],
  [null, null, 25, 65, 15, "اسکرو", "فیلیپ تاپ پیچی", "درب تازه", null],
  [null, null, null, 76, 20, null, null, null, null],
  [null, "رنگ های قابل سفارش درب ها", null, null, null, "سفید ", "سفید", "سفید", null],
  [null, null, null, null, null, "شفاف", "-", "رنگی", null],
  [null, null, null, null, null, "متالایز\n(نقره ای)", "رنگی", "رنگی", null],
];

test("chart wording maps to colour ids", () => {
  assert.deepEqual(colourOf("متالایز\n(نقره ای-طلایی)"), ["metallicSilver", "metallicGold"]);
  assert.deepEqual(colourOf("متالایز (نقره ای)"), ["metallicSilver"]);
  assert.deepEqual(colourOf("-"), []);
  assert.equal(colourOf("بنفش"), null);
});

test("blocks, block-level colours and per-closure colour columns are read", () => {
  const p = parseChart(grid);
  assert.equal(p.shapeLabel, "دایره");
  assert.deepEqual(p.blocks.map((b) => [b.d, b.rows.length]), [[19, 2], [25, 2]]);
  assert.deepEqual(p.blocks[0]!.closures, [
    { label: "اسکرو", colours: ["white", "metallicSilver", "metallicGold"] },
    { label: "بالم لب", colours: ["white", "metallicSilver", "metallicGold"] },
  ]);
  assert.deepEqual(p.blocks[1]!.closures.map((c) => c.colours), [["white", "clear", "metallicSilver"], ["white", "coloured"], ["white", "coloured"]]);
  // "رنگی" twice under the new closure is flagged as a likely typo.
  assert.ok(p.warnings.some((w) => w.includes("twice")));
});

test("merging keeps ids through aliases, adds unknown closures and drops fits the chart removed", () => {
  const cat: ChartCatalogue = {
    shapes: [{ id: "circular", aliases: ["دایره"], name: { fa: "گرد" }, sizes: { "19": [{ l: 1 }], "60": [{ l: 140, ml: 250 }] } }],
    closures: [
      { id: "screw", aliases: ["اسکرو"], name: { fa: "پیچی" }, model: "screw", compat: { circular: { "25": "chart" } } },
      { id: "flipTop", aliases: ["فیلیپ تاپ پیچی"], name: { fa: "فلیپ" }, model: "flipTop", compat: { circular: { "19": "chart", "60": "chart" } } },
      { id: "nozzle", name: { fa: "نازل" }, model: "nozzle", compat: { circular: { "19": "confirm" } } },
      { id: "lipBalm", aliases: ["بالم لب"], name: { fa: "بالم" }, model: "plain", compat: {} },
    ],
  };
  const r = mergeChart(cat, parseChart(grid));
  const by = (id: string) => r.catalogue.closures.find((c) => c.id === id)!;
  assert.deepEqual(r.catalogue.shapes[0]!.sizes["19"], [{ l: 50, ml: 5, status: "chart" }, { l: 65, ml: 10, status: "chart" }]);
  assert.ok(r.catalogue.shapes[0]!.sizes["60"], "diameters missing from the chart are kept");
  assert.deepEqual(by("screw").compat.circular, { "25": "chart", "19": "chart" });
  assert.equal(by("flipTop").compat.circular!["19"], undefined, "a chart fit the chart no longer lists is removed");
  assert.equal(by("flipTop").compat.circular!["60"], "chart", "untouched diameters keep their fits");
  assert.equal(by("nozzle").compat.circular!["19"], "confirm", "on-request fits survive");
  assert.deepEqual(r.added, ["closure1"]);
  assert.deepEqual(by("closure1").colours, { circular: { "25": ["white", "coloured"] } });
  assert.notEqual(cat.closures[0]!.compat.circular!["19"], "chart", "the input is not mutated");
});

test("map fields validate their keys and values", () => {
  const schema: GroupField = { kind: "group", fields: { sizes: { kind: "map", keyPattern: "^[0-9]{1,3}$", of: { kind: "number" } } } };
  assert.deepEqual(validate(schema, { sizes: { "30": 1, "45": 2 } }).issues, []);
  const bad = validate(schema, { sizes: { x: 1, "30": "no" } }).issues.map((i) => i.code).sort();
  assert.deepEqual(bad, ["BAD_KEY", "TYPE"]);
});
