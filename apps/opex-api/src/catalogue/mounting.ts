/**
 * Mounting suggestion from geometry (T2.1). A cap is a shell open on one side. Looking into the
 * opening, a ray travels deep before it meets the underside of the top, and that deep region is a
 * pit: walls (the skirt) close it all round. From the top a cone or dome also looks deep near its
 * edge, but that region runs out to the silhouette with no wall, so it is not a pit.
 *
 * For each of the six axis directions rays are cast on a grid across the bounding box; the deepest
 * walled pit wins. It gives:
 * - `axis`: the direction the opening faces (from the cap towards the tube);
 * - `anchorMm`: the centre of the pit's ceiling, where the top of the neck sits;
 * - `neckDiameterMm`: the width of the innermost chamber, where the neck thread sits.
 *
 * It is a suggestion: an operator confirms it before a model is approved (ADR 0006).
 */

export type Axis = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
export type MountingSuggestion = {
  axis: Axis;
  anchorMm: [number, number, number];
  neckDiameterMm: number;
  /** high: one side is clearly an open, walled, round pit. low: check it in the preview. */
  confidence: "high" | "low";
  /** Pit strength of the best side and of the runner-up (for review). */
  score: [number, number];
};

const N = 80;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

type Pit = { axis: Axis; k: number; u: number; v: number; sign: -1 | 1; cells: number[]; depth: Float64Array; strength: number; walled: number; extent: number };

/**
 * `tris`: triangles in model millimetres, 9 numbers each. `min`/`max`: the bounding box.
 * Returns null when no side has an open pit (a solid part).
 */
export function suggestMounting(tris: Float32Array, min: number[], max: number[]): MountingSuggestion | null {
  const pits: Pit[] = [];
  for (let k = 0; k < 3; k++) {
    const u = (k + 1) % 3;
    const v = (k + 2) % 3;
    const su = (max[u]! - min[u]!) / N;
    const sv = (max[v]! - min[v]!) / N;
    const extent = max[k]! - min[k]!;
    if (!(su > 0) || !(sv > 0) || !(extent > 0)) continue;
    const { lo, hi } = cast(tris, k, u, v, min, su, sv);
    // Rays that pass straight through (an orifice) count as fully deep; misses outside the part don't.
    const outside = border(lo);
    for (const sign of [-1, 1] as const) {
      const depth = new Float64Array(N * N).fill(NaN);
      for (let c = 0; c < N * N; c++) {
        if (lo[c] !== Infinity) depth[c] = sign < 0 ? lo[c]! - min[k]! : max[k]! - hi[c]!;
        else if (!outside[c]) depth[c] = extent;
      }
      const deep = (d: number) => d > 0.3 * extent;
      for (const cells of components(depth, deep)) {
        if (cells.length < 12) continue;
        // Walled: the cells just outside the pit are part surface well above the pit's floor.
        const inPit = new Uint8Array(N * N);
        for (const c of cells) inPit[c] = 1;
        const floor = median(cells.map((c) => depth[c]!).filter((d) => d < extent));
        let edge = 0;
        let wall = 0;
        for (const c of cells)
          for (const n of around(c)) {
            if (n < 0 || inPit[n]) continue;
            edge++;
            if (!Number.isNaN(depth[n]!) && depth[n]! < 0.5 * (floor || extent)) wall++;
          }
        const walled = edge ? wall / edge : 0;
        const area = cells.length * su * sv;
        pits.push({ axis: `${sign < 0 ? "-" : "+"}${"XYZ"[k]}` as Axis, k, u, v, sign, cells, depth, walled, extent, strength: walled * walled * Math.sqrt(area) * ((floor || extent) / extent) });
      }
    }
  }
  const good = pits.filter((p) => p.walled > 0.6).sort((a, b) => b.strength - a.strength);
  const best = good[0];
  if (!best) return null;
  const runner = good.find((p) => p.axis !== best.axis)?.strength ?? 0;

  const { k, u, v, sign, cells, depth, extent } = best;
  const su = (max[u]! - min[u]!) / N;
  const sv = (max[v]! - min[v]!) / N;
  const at = (c: number) => [min[u]! + (Math.floor(c / N) + 0.5) * su, min[v]! + ((c % N) + 0.5) * sv] as const;
  // The mouth: the pit widened to every cell open below the rim (threads and chamfers included).
  const inPit = new Set(cells);
  const rimCells: number[] = [];
  for (const c of cells) for (const n of around(c)) if (n >= 0 && !inPit.has(n) && !Number.isNaN(depth[n]!)) rimCells.push(n);
  const rim = median(rimCells.map((c) => depth[c]!));
  const mouth = components(depth, (d) => d > rim + Math.max(0.3, 0.02 * extent)).find((m) => m.some((c) => inPit.has(c))) ?? cells;
  const cu = mouth.reduce((s, c) => s + at(c)[0], 0) / mouth.length;
  const cv = mouth.reduce((s, c) => s + at(c)[1], 0) / mouth.length;
  const area = mouth.length * su * sv;
  const diameter = 2 * Math.sqrt(area / Math.PI);
  let far = 0;
  for (const c of mouth) far = Math.max(far, Math.hypot(at(c)[0] - cu, at(c)[1] - cv));
  const roundness = far > 0 ? area / (Math.PI * far * far) : 0;
  // The ceiling the neck top meets: the pit floor near its centre (an inner plug sits in the neck).
  const near = cells.filter((c) => Math.hypot(at(c)[0] - cu, at(c)[1] - cv) < diameter / 2).map((c) => depth[c]!).filter((d) => d < extent);
  const ceiling = near.length ? percentile(near, 0.75) : rim;
  // The neck sits in the innermost chamber: cells near the ceiling; its width (90th percentile
  // distance from the centre, so an inner plug doesn't shrink it) is the neck diameter.
  const chamber = cells.filter((c) => depth[c]! < extent && depth[c]! >= rim + 0.6 * (ceiling - rim));
  const dists = chamber.map((c) => Math.hypot(at(c)[0] - cu, at(c)[1] - cv));
  const neck = chamber.length >= 12 ? 2 * percentile(dists, 0.9) + Math.min(su, sv) : diameter;
  const anchor = [0, 0, 0] as [number, number, number];
  anchor[u] = r2(cu);
  anchor[v] = r2(cv);
  anchor[k] = r2(sign < 0 ? min[k]! + ceiling : max[k]! - ceiling);
  const confidence = best.strength > 2 * runner && roundness > 0.72 && best.walled > 0.85 ? "high" : "low";
  return { axis: best.axis, anchorMm: anchor, neckDiameterMm: r1(Math.min(neck, diameter)), confidence, score: [r2(best.strength), r2(runner)] };
}

/** First and last hit along axis k for a ray through each grid cell. */
function cast(tris: Float32Array, k: number, u: number, v: number, min: number[], su: number, sv: number) {
  const lo = new Float64Array(N * N).fill(Infinity);
  const hi = new Float64Array(N * N).fill(-Infinity);
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t + u]!, ay = tris[t + v]!, az = tris[t + k]!;
    const bx = tris[t + 3 + u]!, by = tris[t + 3 + v]!, bz = tris[t + 3 + k]!;
    const cx = tris[t + 6 + u]!, cy = tris[t + 6 + v]!, cz = tris[t + 6 + k]!;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - min[u]!) / su - 0.5));
    const i1 = Math.min(N - 1, Math.floor((Math.max(ax, bx, cx) - min[u]!) / su - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - min[v]!) / sv - 0.5));
    const j1 = Math.min(N - 1, Math.floor((Math.max(ay, by, cy) - min[v]!) / sv - 0.5));
    for (let i = i0; i <= i1; i++) {
      const px = min[u]! + (i + 0.5) * su;
      for (let j = j0; j <= j1; j++) {
        const py = min[v]! + (j + 0.5) * sv;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * az + l2 * bz + l3 * cz;
        const c = i * N + j;
        if (z < lo[c]!) lo[c] = z;
        if (z > hi[c]!) hi[c] = z;
      }
    }
  }
  return { lo, hi };
}

/** Missed cells connected to the grid border: outside the part. */
function border(lo: Float64Array) {
  const out = new Uint8Array(N * N);
  const stack: number[] = [];
  for (let i = 0; i < N; i++) for (const c of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (lo[c] === Infinity && !out[c]) (out[c] = 1), stack.push(c);
  while (stack.length) {
    const c = stack.pop()!;
    for (const n of around(c)) if (n >= 0 && !out[n] && lo[n] === Infinity) (out[n] = 1), stack.push(n);
  }
  return out;
}

function around(c: number) {
  const i = Math.floor(c / N), j = c % N;
  return [i > 0 ? c - N : -1, i < N - 1 ? c + N : -1, j > 0 ? c - 1 : -1, j < N - 1 ? c + 1 : -1];
}

/** 4-connected groups of cells whose depth passes `ok`, largest first. */
function components(depth: Float64Array, ok: (d: number) => boolean) {
  const seen = new Uint8Array(N * N);
  const out: number[][] = [];
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || Number.isNaN(depth[s]!) || !ok(depth[s]!)) continue;
    const group: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      for (const n of around(c)) if (n >= 0 && !seen[n] && !Number.isNaN(depth[n]!) && ok(depth[n]!)) (seen[n] = 1), stack.push(n);
    }
    out.push(group);
  }
  return out.sort((a, b) => b.length - a.length);
}

const median = (xs: number[]) => percentile(xs, 0.5);
function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}
