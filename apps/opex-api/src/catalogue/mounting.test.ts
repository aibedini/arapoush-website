import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestMounting } from "./mounting.ts";

/**
 * A cap as triangles: a cylinder shell open at z = 0, outer radius R, bore r, height h, a top of
 * thickness `top`. Optionally a cone on top (a bullet cap), which must not read as an opening.
 */
function cup({ R = 10, r = 8, h = 20, top = 2, cone = 0, seg = 64 } = {}) {
  const t: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => t.push(...a, ...b, ...c, ...a, ...c, ...d);
  const p = (rad: number, i: number, z: number) => [rad * Math.cos((2 * Math.PI * i) / seg), rad * Math.sin((2 * Math.PI * i) / seg), z];
  for (let i = 0; i < seg; i++) {
    quad(p(R, i, 0), p(R, i + 1, 0), p(R, i + 1, h), p(R, i, h)); // outer wall
    quad(p(r, i, 0), p(r, i + 1, 0), p(r, i + 1, h - top), p(r, i, h - top)); // bore wall
    quad(p(r, i, 0), p(R, i, 0), p(R, i + 1, 0), p(r, i + 1, 0)); // rim
    t.push(0, 0, h - top, ...p(r, i, h - top), ...p(r, i + 1, h - top)); // ceiling
    if (cone) t.push(0, 0, h + cone, ...p(R, i, h), ...p(R, i + 1, h));
    else t.push(0, 0, h, ...p(R, i, h), ...p(R, i + 1, h)); // flat top
  }
  const f = new Float32Array(t);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < f.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k]!, f[i + k]!)), (max[k] = Math.max(max[k]!, f[i + k]!));
  return { f, min, max };
}

test("mounting: a plain cap opens towards -Z, the neck meets the ceiling, neck = bore", () => {
  const { f, min, max } = cup();
  const s = suggestMounting(f, min, max)!;
  assert.equal(s.axis, "-Z");
  assert.equal(s.confidence, "high");
  assert.ok(Math.abs(s.anchorMm[2] - 18) < 0.6, `ceiling at ${s.anchorMm[2]}`);
  assert.ok(Math.abs(s.anchorMm[0]) < 0.3 && Math.abs(s.anchorMm[1]) < 0.3);
  assert.ok(Math.abs(s.neckDiameterMm - 16) < 1, `neck ${s.neckDiameterMm}`);
});

test("mounting: a bullet cap's cone top is not mistaken for the opening", () => {
  const { f, min, max } = cup({ cone: 14 });
  assert.equal(suggestMounting(f, min, max)!.axis, "-Z");
});

test("mounting: the same cap turned over opens towards +Z", () => {
  const { f, min, max } = cup();
  for (let i = 2; i < f.length; i += 3) f[i] = -f[i]!;
  const s = suggestMounting(f, [min[0]!, min[1]!, -max[2]!], [max[0]!, max[1]!, -min[2]!])!;
  assert.equal(s.axis, "+Z");
  assert.ok(Math.abs(s.anchorMm[2] + 18) < 0.6);
});
