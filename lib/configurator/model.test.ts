import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capacity, closuresFor, diametersFor, fromSearch, isValid, normalize, sameVolume, toSearch, withDiameter, withShape, type Catalogue } from "./model.ts";

const cat: Catalogue = JSON.parse(readFileSync(new URL("../../content/tube-catalogue.json", import.meta.url), "utf8"));

test("shape diameters match the manufacturer listing", () => {
  assert.deepEqual(diametersFor(cat, "circular"), [19, 25, 30, 35, 40, 50, 60]);
  assert.deepEqual(diametersFor(cat, "oval"), [30, 35, 40]);
  assert.deepEqual(diametersFor(cat, "eyeNozzle"), [19, 25]);
});

test("Ø30 × 110 circular reads 50 ml from the chart, never a formula", () => {
  assert.deepEqual(capacity(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop" }), { ml: 50, status: "chart" });
});

test("inferred volumes are flagged as estimates", () => {
  assert.equal(capacity(cat, { shape: "circular", d: 50, l: 115, closure: "flipTop" })?.status, "estimate");
});

test("oval and eye-nozzle have no published volume yet", () => {
  assert.equal(capacity(cat, { shape: "oval", d: 35, l: 120, closure: "screw" }), null);
  assert.equal(capacity(cat, { shape: "eyeNozzle", d: 19, l: 84, closure: "nozzle" }), null);
});

test("every catalogue length per shape and diameter is valid", () => {
  for (const shape of ["circular", "oval", "eyeNozzle"] as const)
    for (const d of diametersFor(cat, shape))
      for (const l of cat.lengths[shape][String(d)]!) {
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
  assert.equal(normalize(cat, { shape: "circular", d: 19, closure: "flipTop" }).closure, "screw");
  // Eye-nozzle tubes only take the nozzle closure.
  assert.equal(normalize(cat, { shape: "eyeNozzle", d: 19, closure: "screw" }).closure, "nozzle");
  assert.ok(!closuresFor(cat, "circular", 60).some((c) => c.closure === "screw"));
});

test("garbage URLs cannot produce an invalid configuration", () => {
  for (const q of ["", "shape=hexagon&d=x&l=-4&cap=<script>", "shape=oval&d=19&l=999&cap=nozzle", "shape=eyeNozzle&d=60&cap=flipTop"]) {
    assert.ok(isValid(cat, fromSearch(cat, q)), q);
  }
});

test("shared links round-trip", () => {
  const c = normalize(cat, { shape: "circular", d: 40, l: 120, closure: "flipTop" });
  assert.deepEqual(fromSearch(cat, toSearch(c)), c);
});

test("changing diameter keeps the volume as close as possible", () => {
  const c = withDiameter(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop" }, 35);
  assert.equal(capacity(cat, c)?.ml, 50);
  assert.equal(c.l, 90);
});

test("switching shape keeps a valid diameter and closure", () => {
  const c = withShape(cat, { shape: "circular", d: 60, l: 155, closure: "flipTop" }, "eyeNozzle");
  assert.deepEqual([c.d, c.closure], [25, "nozzle"]);
  assert.ok(isValid(cat, c));
});

test("same-volume alternatives exclude the current diameter", () => {
  const alt = sameVolume(cat, { shape: "circular", d: 40, l: 120, closure: "flipTop" });
  assert.deepEqual(alt.map((a) => a.d).sort(), [35, 50]);
});
