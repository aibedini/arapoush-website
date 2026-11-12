import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capacity, closuresFor, closuresForShape, coloursFor, printsFor, sceneLook, diametersFor, fromSearch, isValid, lengthsFor, loc, normalize, rankSamples, sameVolume, sceneModels, structuresFor, toSearch, withDiameter, withShape, type TubeProduct } from "./model.ts";

const cat: TubeProduct = JSON.parse(readFileSync(new URL("../../content/products/multi-layer-tube.json", import.meta.url), "utf8"));

test("shape diameters match the size charts (Ø60 round kept from v2)", () => {
  assert.deepEqual(diametersFor(cat, "circular"), [19, 25, 30, 35, 40, 50, 60]);
  assert.deepEqual(diametersFor(cat, "oval"), [30, 35, 40, 50]);
  assert.deepEqual(cat.shapes.map((s) => s.id), ["circular", "oval"]);
});

test("Ø30 × 110 circular reads 50 ml from the chart, never a formula", () => {
  assert.deepEqual(capacity(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "pe-evoh-5" }), { ml: 50, status: "chart" });
});

test("chart volumes replace the earlier estimates", () => {
  assert.deepEqual(capacity(cat, { shape: "circular", d: 50, l: 115, closure: "flipTop", structure: "pe-evoh-5" }), { ml: 140, status: "chart" });
});

test("oval tubes now have their chart volumes", () => {
  assert.deepEqual(capacity(cat, { shape: "oval", d: 35, l: 112, closure: "ovalScrew", structure: "pe-evoh-5" }), { ml: 60, status: "chart" });
});

test("closure colours follow the chart per shape and diameter", () => {
  const ids = (closure: string, shape: string, d: number) => coloursFor(cat, closure, shape, d).map((f) => f.id);
  assert.deepEqual(ids("airless", "circular", 30), ["white", "metallicSilver"]);
  assert.deepEqual(ids("flipTop", "circular", 30), ["white", "coloured", "clear"]);
  assert.deepEqual(ids("screw", "circular", 19), ["white", "coloured", "clear", "metallicSilver", "metallicGold"]);
  assert.deepEqual(ids("ovalBullet", "oval", 50), ["white", "coloured"]);
  assert.deepEqual(ids("screw", "oval", 30), []);
});

test("each shape lists only its own closures", () => {
  assert.deepEqual(closuresForShape(cat, "oval").map((c) => c.id), ["ovalScrew", "superOval", "ovalEyeNozzle", "ovalFlipTop", "ovalBullet"]);
  assert.ok(!closuresForShape(cat, "circular").some((c) => c.id.startsWith("oval") || c.id === "superOval"));
});

test("eye-nozzle caps put an eye-nozzle shoulder on the tube in 3D", () => {
  assert.deepEqual(sceneModels(cat, { shape: "circular", d: 19, l: 65, closure: "eyeNozzleLong", structure: "pe-evoh-5" }), { shape: "eyeNozzle", closure: "nozzle", closureShape: { height: 1.6 }, closureModel: undefined });
  assert.deepEqual(sceneModels(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "pe-evoh-5" }), { shape: "circular", closure: "flipTop", closureShape: undefined, closureModel: undefined });
});

test("every chart closure has a 3D shape: a built family or parametric parameters", () => {
  for (const c of cat.closures) {
    if (c.model === "param") assert.ok(c.shape3d && c.shape3d.height, c.id);
    else assert.ok(["flipTop", "screw", "nozzle", "standUp", "plain"].includes(c.model), c.id);
  }
  assert.equal(cat.closures.find((c) => c.id === "octagonal")?.shape3d?.body, "octagon");
});

test("links from before v3 (shape=eyeNozzle) still open an eye-nozzle tube", () => {
  const c = fromSearch(cat, "shape=eyeNozzle&d=19&l=84&cap=nozzle");
  assert.deepEqual([c.shape, c.d, c.l, c.closure], ["circular", 19, 84, "eyeNozzleLong"]);
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
  assert.equal(normalize(cat, { shape: "oval", d: 60 }).d, 50);
  assert.equal(normalize(cat, { shape: "oval", d: 19 }).d, 30);
  assert.equal(normalize(cat, { shape: "circular", d: 33 }).d, 35);
});

test("lengths outside the catalogue snap to the nearest listed length", () => {
  assert.equal(normalize(cat, { shape: "circular", d: 30, l: 300 }).l, 149);
  assert.equal(normalize(cat, { shape: "circular", d: 19, l: 1 }).l, 50);
});

test("unsupported closures are replaced, never kept", () => {
  // Ø19 takes screw, long eye-nozzle and lip-balm caps; flip-top starts at Ø25.
  assert.equal(normalize(cat, { shape: "circular", d: 19, closure: "flipTop", structure: "pe-evoh-5" }).closure, "screw");
  // Oval tubes take the oval caps only.
  assert.equal(normalize(cat, { shape: "oval", d: 35, closure: "screw", structure: "pe-evoh-5" }).closure, "ovalScrew");
  assert.ok(!closuresFor(cat, "circular", 60).some((c) => c.closure === "screw"));
  assert.deepEqual(
    closuresFor(cat, "circular", 30).filter((c) => c.status === "chart").map((c) => c.closure),
    ["screw", "flipTop", "eyeNozzleShort", "airless", "octagonal", "conical"],
  );
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
  const c = withShape(cat, { shape: "circular", d: 60, l: 155, closure: "flipTop", structure: "pe-evoh-5" }, "oval");
  assert.deepEqual([c.d, c.closure], [50, "ovalFlipTop"]);
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
  assert.deepEqual(c, { shape: "square", d: 45, l: 120, closure: "pump", structure: "pe-evoh-5", colour: "", capHex: "", body: "#fbfcfd", print: "flexo" });
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
  assert.equal(rankSamples(cat, { shape: "circular", d: 19, l: 50, closure: "eyeNozzleLong", structure: "pe-evoh-5" })[0]?.sample.id, "eye-nozzle");
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
  two.structures.push({ id: "big", name: { en: "Heavy wall" }, layers: [], diameters: [50], closures: ["screw"] });
  assert.deepEqual(structuresFor(two, "circular", 50, "screw").map((x) => x.id), ["pe-evoh-5", "abl", "big"]);
  assert.ok(!structuresFor(two, "circular", 40, "screw").some((x) => x.id === "big"));
  const c = normalize(two, { shape: "circular", d: 40, l: 120, closure: "flipTop", structure: "abl" });
  assert.deepEqual(fromSearch(two, toSearch(c)), c);
});

test("cap colour follows the chart: kept when offered, replaced when not", () => {
  const base = { shape: "circular", d: 30, l: 110, closure: "airless", structure: "pe-evoh-5" };
  assert.equal(normalize(cat, { ...base, colour: "metallicSilver" }).colour, "metallicSilver");
  // Airless at Ø30 has no clear or gold: back to the first family it offers.
  assert.equal(normalize(cat, { ...base, colour: "clear" }).colour, "white");
  assert.equal(normalize(cat, { ...base, closure: "flipTop", colour: "metallicGold" }).colour, "white");
});

test("a custom cap colour is only kept for the coloured family, and only as a hex", () => {
  const base = { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "pe-evoh-5" };
  assert.equal(normalize(cat, { ...base, colour: "coloured", capHex: "#C8102E" }).capHex, "#c8102e");
  assert.equal(normalize(cat, { ...base, colour: "white", capHex: "#c8102e" }).capHex, "");
  assert.equal(normalize(cat, { ...base, colour: "coloured", capHex: "red; x" }).capHex, "");
});

test("body colour and print: validated, defaulted, and round-trip through the link", () => {
  const c = normalize(cat, { shape: "oval", d: 35, l: 100, closure: "ovalScrew", colour: "coloured", capHex: "#2e7d32", body: "#1d1f22", print: "hotstamp" });
  assert.deepEqual([c.body, c.print, c.colour, c.capHex], ["#1d1f22", "hotstamp", "coloured", "#2e7d32"]);
  assert.deepEqual(fromSearch(cat, toSearch(c)), c);
  assert.equal(normalize(cat, { print: "laser" }).print, "", "unknown methods fall back to no print");
  assert.equal(normalize(cat, { print: "" }).print, "");
  assert.equal(normalize(cat, { body: "javascript:x" }).body, "#fbfcfd");
  assert.deepEqual(printsFor(cat, "circular", 19).map((p) => p.id), ["flexo", "offset", "silk", "hotstamp", "combination"]);
});

test("the scene gets the cap material, body colour and print effect", () => {
  const look = sceneLook(cat, normalize(cat, { shape: "circular", d: 30, l: 110, closure: "screw", colour: "metallicGold", body: "#c9ced3", print: "silk" }));
  assert.deepEqual(look, { cap: { kind: "metallic", hex: "#c9a24a" }, body: "#c9ced3", print: { effect: "raised", foil: undefined, artwork: undefined } });
  const custom = sceneLook(cat, normalize(cat, { shape: "circular", d: 30, l: 110, closure: "flipTop", colour: "coloured", capHex: "#e8893a", print: "" }));
  assert.deepEqual(custom.cap, { kind: "solid", hex: "#e8893a" });
  assert.equal(custom.print, undefined);
});
