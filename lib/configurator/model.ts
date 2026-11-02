/**
 * Tube configurator rules. Pure functions over the catalogue (content/tube-catalogue.json),
 * so the same validation runs on the server, in the browser and in `node --test`.
 * No imports on purpose: Node's type stripping runs this file directly in tests.
 */

export const SHAPES = ["circular", "oval", "eyeNozzle"] as const;
export const CLOSURES = ["flipTop", "screw", "nozzle", "standUp"] as const;
export type Shape = (typeof SHAPES)[number];
export type Closure = (typeof CLOSURES)[number];

/** chart = Arapoush size chart (indicative), estimate = inferred, confirm = offered, awaiting sign-off. */
export type Status = "chart" | "estimate" | "confirm";

export type Catalogue = {
  version: number;
  updated: string;
  shapes: Record<Shape, { diameters: number[] }>;
  lengths: Record<Shape, Record<string, number[]>>;
  volumes: { shape: Shape; d: number; l: number; ml: number; status: Exclude<Status, "confirm"> }[];
  closures: Record<Closure, Partial<Record<Shape, Record<string, Status>>>>;
};

export type TubeConfig = { shape: Shape; d: number; l: number; closure: Closure };
export type Capacity = { ml: number; status: Exclude<Status, "confirm"> };

export const DEFAULT_CONFIG: TubeConfig = { shape: "circular", d: 30, l: 110, closure: "flipTop" };

const isShape = (v: unknown): v is Shape => SHAPES.includes(v as Shape);
const isClosure = (v: unknown): v is Closure => CLOSURES.includes(v as Closure);

export const nearest = (list: number[], v: number) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]!);

export const diametersFor = (cat: Catalogue, shape: Shape) => cat.shapes[shape].diameters;

export const lengthsFor = (cat: Catalogue, shape: Shape, d: number) => cat.lengths[shape][String(d)] ?? [];

/** null = this closure is not offered for that shape and diameter. */
export const closureStatus = (cat: Catalogue, closure: Closure, shape: Shape, d: number): Status | null => cat.closures[closure][shape]?.[String(d)] ?? null;

export const closuresFor = (cat: Catalogue, shape: Shape, d: number) =>
  CLOSURES.map((closure) => ({ closure, status: closureStatus(cat, closure, shape, d) })).filter(
    (c): c is { closure: Closure; status: Status } => c.status !== null,
  );

/** Nominal fill volume from the catalogue; null means "ask Arapoush" — never a formula. */
export const capacity = (cat: Catalogue, c: TubeConfig): Capacity | null => {
  const row = cat.volumes.find((v) => v.shape === c.shape && v.d === c.d && v.l === c.l);
  return row ? { ml: row.ml, status: row.status } : null;
};

/** Other catalogue sizes of the same shape and volume (different diameter). */
export const sameVolume = (cat: Catalogue, c: TubeConfig) => {
  const cap = capacity(cat, c);
  if (!cap) return [];
  return cat.volumes.filter((v) => v.shape === c.shape && v.ml === cap.ml && v.d !== c.d);
};

const preferred = (cat: Catalogue, shape: Shape, d: number, want: Closure) => {
  const options = closuresFor(cat, shape, d);
  if (options.some((o) => o.closure === want)) return want;
  return (options.find((o) => o.status === "chart") ?? options[0])?.closure ?? null;
};

/**
 * Turns any input (URL, stale state, partial patch) into a producible configuration.
 * Unknown values snap to the nearest catalogue entry; closures fall back to a compatible one.
 */
export function normalize(cat: Catalogue, input: Partial<Record<keyof TubeConfig, unknown>>): TubeConfig {
  const shape = isShape(input.shape) ? input.shape : DEFAULT_CONFIG.shape;
  const ds = diametersFor(cat, shape);
  const dIn = Number(input.d);
  const d = Number.isFinite(dIn) ? nearest(ds, dIn) : ds.includes(DEFAULT_CONFIG.d) ? DEFAULT_CONFIG.d : ds[0]!;
  const ls = lengthsFor(cat, shape, d);
  const lIn = Number(input.l);
  const l = Number.isFinite(lIn) ? nearest(ls, lIn) : nearest(ls, DEFAULT_CONFIG.l);
  const want = isClosure(input.closure) ? input.closure : DEFAULT_CONFIG.closure;
  const closure = preferred(cat, shape, d, want);
  if (!closure) throw new Error(`Catalogue offers no closure for ${shape} Ø${d}`);
  return { shape, d, l, closure };
}

/** Changing diameter keeps the volume as close as the new diameter allows (falls back to length). */
export function withDiameter(cat: Catalogue, c: TubeConfig, d: number): TubeConfig {
  const cap = capacity(cat, c);
  const ls = lengthsFor(cat, c.shape, d);
  const byVolume = cap
    ? cat.volumes
        .filter((v) => v.shape === c.shape && v.d === d)
        .reduce<(typeof cat.volumes)[number] | null>((best, v) => (!best || Math.abs(v.ml - cap.ml) < Math.abs(best.ml - cap.ml) ? v : best), null)
    : null;
  return normalize(cat, { ...c, d, l: byVolume?.l ?? (ls.length ? nearest(ls, c.l) : c.l) });
}

export function withShape(cat: Catalogue, c: TubeConfig, shape: Shape): TubeConfig {
  return normalize(cat, { ...c, shape, d: nearest(diametersFor(cat, shape), c.d) });
}

/** URL ⇄ config. Short keys keep shared links readable. */
export const toSearch = (c: TubeConfig) => `shape=${c.shape}&d=${c.d}&l=${c.l}&cap=${c.closure}`;

export const fromSearch = (cat: Catalogue, search: string | URLSearchParams) => {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  return normalize(cat, { shape: p.get("shape") ?? undefined, d: p.get("d") ?? undefined, l: p.get("l") ?? undefined, closure: p.get("cap") ?? undefined });
};

export const isValid = (cat: Catalogue, c: TubeConfig) => {
  const n = normalize(cat, c);
  return n.shape === c.shape && n.d === c.d && n.l === c.l && n.closure === c.closure;
};
