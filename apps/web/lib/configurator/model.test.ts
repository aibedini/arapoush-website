import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capacity, closuresFor, diametersFor, fromSearch, isValid, lengthsFor, loc, normalize, rankSamples, sameVolume, toSearch, withDiameter, withShape, type TubeProduct } from "./model.ts";

const cat: TubeProduct = JSON.parse(readFileSync(new URL("../../content/products/multi-layer-tube.json", import.meta.url), "utf8"));

test("shape diameters match the manufacturer listing", () => {
  assert.deepEqual(diametersFor(cat, "circular"), [19, 25, 30, 35, 40, 50, 60]);
  assert.deepEqual(diametersFor(cat, "oval"), [30, 35, 40]);
  assert.deepEqual(diametersFor(cat, "eyeNozzle"), [19, 25]);
});

test("Ø30 × 110 circular reads 50 ml from the chart, never a formula", () => {
  assert.deepEqual(capacity(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "pe-evoh-5" }), { ml: 50, status: "chart" });
});

test("inferred volumes are flagged as estimates", () => {
  assert.equal(capacity(cat, { shape: "circular", d: 50, l: 115, closure: "flipTop", structure: "pe-evoh-5" })?.status, "estimate");
});

test("oval and eye-nozzle have no published volume yet", () => {
  assert.equal(capacity(cat, { shape: "oval", d: 35, l: 120, closure: "screw", structure: "pe-evoh-5" }), null);
  assert.equal(capacity(cat, { shape: "eyeNozzle", d: 19, l: 84, closure: "nozzle", structure: "pe-evoh-5" }), null);
});

test("every catalogue length per shape and diameter is valid", () => {
  for (const { id: shape } of cat.shapes)
    for (const d of diametersFor(cat, shape))
      for (const l of lengthsFor(cat, shape, d)) {
        const c = normalize(cat, { shape, d, l });
        assert.ok(isValid(cat, c), `${shape} ${d}x${l}`);
      }
});

test("invalid diameters snap to the nearest allowed one for that shape", () => {
  assert.equal(normalize(cat, { shape: "oval", d: 60 }).d, 40);
  assert.equal(normalize(cat, { shape: "eyeNozzle", d: 50 }).d, 25);
  assert.equal(normalize(cat, { shape: "circular", d: 33 }).d, 35);
});

test("lengths outside the catalogue snap to the nearest listed length", () => {
  assert.equal(normalize(cat, { shape: "circular", d: 30, l: 300 }).l, 149);
  assert.equal(normalize(cat, { shape: "circular", d: 19, l: 1 }).l, 50);
});

test("unsupported closures are replaced, never kept", () => {
  // Ø19 is only listed with a screw cap; flip-top starts at Ø25.
  assert.equal(normalize(cat, { shape: "circular", d: 19, closure: "flipTop", structure: "pe-evoh-5" }).closure, "screw");
  // Eye-nozzle tubes only take the nozzle closure.
  assert.equal(normalize(cat, { shape: "eyeNozzle", d: 19, closure: "screw", structure: "pe-evoh-5" }).closure, "nozzle");
  assert.ok(!closuresFor(cat, "circular", 60).some((c) => c.closure === "screw"));
});

test("garbage URLs cannot produce an invalid configuration", () => {
  for (const q of ["", "shape=hexagon&d=x&l=-4&cap=<script>", "shape=oval&d=19&l=999&cap=nozzle", "shape=eyeNozzle&d=60&cap=flipTop"]) {
    assert.ok(isValid(cat, fromSearch(cat, q)), q);
  }
});

test("shared links round-trip", () => {
  const c = normalize(cat, { shape: "circular", d: 40, l: 120, closure: "flipTop", structure: "pe-evoh-5" });
  assert.deepEqual(fromSearch(cat, toSearch(c)), c);
});

test("changing diameter keeps the volume as close as possible", () => {
  const c = withDiameter(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "pe-evoh-5" }, 35);
  assert.equal(capacity(cat, c)?.ml, 50);
  assert.equal(c.l, 90);
});

test("switching shape keeps a valid diameter and closure", () => {
  const c = withShape(cat, { shape: "circular", d: 60, l: 155, closure: "flipTop", structure: "pe-evoh-5" }, "eyeNozzle");
  assert.deepEqual([c.d, c.closure], [25, "nozzle"]);
  assert.ok(isValid(cat, c));
});

test("same-volume alternatives exclude the current diameter", () => {
  const alt = sameVolume(cat, { shape: "circular", d: 40, l: 120, closure: "flipTop", structure: "pe-evoh-5" });
  assert.deepEqual(alt.map((a) => a.d).sort(), [35, 50]);
});

test("admin-added shapes and closures work without code changes", () => {
  const extra: TubeProduct = structuredClone(cat);
  extra.shapes.push({ id: "square", model: "oval", name: { en: "Square" }, image: "/x.webp", sizes: { "45": [{ l: 120, ml: 150, status: "chart" }] } });
  extra.closures.push({ id: "pump", model: "plain", name: { en: "Pump" }, image: "/y.webp", compat: { square: { "45": "confirm" } } });
  const c = normalize(extra, { shape: "square", d: 99, closure: "flipTop", structure: "pe-evoh-5" });
  assert.deepEqual(c, { shape: "square", d: 45, l: 120, closure: "pump", structure: "pe-evoh-5" });
  assert.equal(capacity(extra, c)?.ml, 150);
});

test("removing a closure everywhere drops it from every configuration", () => {
  const less: TubeProduct = structuredClone(cat);
  less.closures = less.closures.filter((c) => c.id !== "flipTop");
  assert.notEqual(normalize(less, { shape: "circular", d: 40, closure: "flipTop", structure: "pe-evoh-5" }).closure, "flipTop");
});

test("shapes with no producible closure are skipped", () => {
  const bare: TubeProduct = structuredClone(cat);
  bare.closures = bare.closures.map((c) => ({ ...c, compat: { ...c.compat, oval: {} } }));
  assert.equal(normalize(bare, { shape: "oval" }).shape, "circular");
});

test("samples rank by shape, then closure", () => {
  const ranked = rankSamples(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "pe-evoh-5" });
  assert.ok(ranked.every((r) => r.sample.shape === "circular"));
  assert.equal(ranked[0]?.sample.closure, "flipTop");
  assert.ok(rankSamples(cat, { shape: "eyeNozzle", d: 19, l: 50, closure: "nozzle", structure: "pe-evoh-5" }).every((r) => r.sample.shape === "eyeNozzle"));
});

test("missing translations fall back to English", () => {
  assert.equal(loc({ en: "Pump" }, "fa"), "Pump");
  assert.equal(loc({ fa: "پمپ", en: "Pump" }, "fa"), "پمپ");
});

test("structures are selectable, validated and limited by shape", () => {
  const two: TubeProduct = structuredClone(cat);
  two.structures.push({ id: "abl", name: { en: "Aluminium barrier" }, layers: [], shapes: ["circular"] });
  assert.equal(normalize(two, { shape: "circular", structure: "abl" }).structure, "abl");
  assert.equal(normalize(two, { shape: "oval", structure: "abl" }).structure, "pe-evoh-5");
  assert.equal(normalize(two, { structure: "nope" }).structure, "pe-evoh-5");
  const c = normalize(two, { shape: "circular", d: 40, l: 120, closure: "flipTop", structure: "abl" });
  assert.deepEqual(fromSearch(two, toSearch(c)), c);
});
