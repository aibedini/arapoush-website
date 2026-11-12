/**
 * Tube configurator rules. Pure functions over the product content (content/products/multi-layer-tube.json),
 * so every shape, closure, size and sample the admin adds works without code changes, and the same
 * validation runs on the server, in the browser and in `node --test`.
 * No imports on purpose: Node's type stripping runs this file directly in tests.
 */

export type Localized = Record<string, string>;
/** 3D geometry families the scene knows how to build. New ids map onto one of these. */
export type ShapeModel = "circular" | "oval" | "eyeNozzle";
export type ClosureModel = "flipTop" | "screw" | "nozzle" | "standUp" | "plain";
/** chart = Arapoush size chart (indicative), estimate = inferred. */
export type VolumeStatus = "chart" | "estimate";
/** chart = listed by Arapoush, confirm = offered, awaiting sign-off. */
export type CompatStatus = "chart" | "confirm";

export type SizeRow = { l: number; ml?: number; status?: VolumeStatus };
/** `aliases`: wordings in the Arapoush size charts that map onto this entry (chart import). */
export type ShapeDef = { id: string; model: ShapeModel; name: Localized; image: string; sizes: Record<string, SizeRow[]>; aliases?: string[] };
/** Colour family ids, as in the size charts: white, coloured, transparent, metallic silver / gold. */
export type ColourId = "white" | "coloured" | "clear" | "metallicSilver" | "metallicGold";
export type ColourFamily = { id: ColourId; name: Localized; kind: "solid" | "custom" | "clear" | "metallic"; swatch: string };
export type ClosureDef = {
  id: string;
  model: ClosureModel;
  name: Localized;
  image: string;
  compat: Record<string, Record<string, CompatStatus>>;
  /** Colour families offered, per shape and diameter (from the charts). */
  colours?: Record<string, Record<string, ColourId[]>>;
  /** Tube shoulder this closure needs (eye-nozzle caps sit on an eye-nozzle shoulder). */
  shoulder?: ShapeModel;
  aliases?: string[];
};
export type LayerDef = { id: string; color: string; name: Localized; text: Localized };
/** A wall build-up, layers listed outside → inside. `shapes` limits it to some tube shapes. */
export type StructureDef = { id: string; name: Localized; layers: LayerDef[]; shapes?: string[]; diameters?: number[]; closures?: string[] };
export type SampleDef = { id: string; image: string; shape: string; closure?: string; d?: number; title: Localized };
export type ProductImage = { ltr: string; rtl: string; width: number; height: number; alt: Localized };

export type TubeProduct = {
  version: number;
  updated: string;
  images: { hero: ProductImage; layers: ProductImage };
  shapes: ShapeDef[];
  closures: ClosureDef[];
  colourFamilies?: ColourFamily[];
  structures: StructureDef[];
  samples: SampleDef[];
};

export type TubeConfig = { shape: string; d: number; l: number; closure: string; structure: string };
export type Capacity = { ml: number; status: VolumeStatus };

/** Preferred starting point; ignored piece by piece when the catalogue doesn't offer it. */
export const DEFAULT_CONFIG: TubeConfig = { shape: "circular", d: 30, l: 110, closure: "flipTop", structure: "" };

/** Localised text with an English, then any, fallback — admin entries may miss a language. */
export const loc = (text: Localized | undefined, locale: string) => text?.[locale] || text?.en || Object.values(text ?? {})[0] || "";

export const nearest = (list: number[], v: number) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]!);

export const shapeOf = (cat: TubeProduct, id: string) => cat.shapes.find((s) => s.id === id);
export const closureOf = (cat: TubeProduct, id: string) => cat.closures.find((c) => c.id === id);
export const structureOf = (cat: TubeProduct, id: string) => cat.structures.find((s) => s.id === id);
/** Wall structures offered for a shape (and, when given, a diameter and closure). */
export const structuresFor = (cat: TubeProduct, shape: string, d?: number, closure?: string) =>
  cat.structures.filter(
    (s) => (!s.shapes?.length || s.shapes.includes(shape)) && (d == null || !s.diameters?.length || s.diameters.includes(d)) && (closure == null || !s.closures?.length || s.closures.includes(closure)),
  );

/** Colour families a closure comes in at a shape and diameter, in catalogue order. */
export const coloursFor = (cat: TubeProduct, closure: string, shape: string, d: number): ColourFamily[] => {
  const ids = closureOf(cat, closure)?.colours?.[shape]?.[String(d)] ?? [];
  return (cat.colourFamilies ?? []).filter((f) => ids.includes(f.id));
};

/** 3D families for the scene: an eye-nozzle closure swaps in its own shoulder. */
export const sceneModels = (cat: TubeProduct, c: TubeConfig) => ({
  shape: closureOf(cat, c.closure)?.shoulder ?? shapeOf(cat, c.shape)?.model ?? "circular",
  closure: closureOf(cat, c.closure)?.model ?? "plain",
});

export const diametersFor = (cat: TubeProduct, shape: string) =>
  Object.keys(shapeOf(cat, shape)?.sizes ?? {})
    .map(Number)
    .sort((a, b) => a - b);

const rowsFor = (cat: TubeProduct, shape: string, d: number) => shapeOf(cat, shape)?.sizes[String(d)] ?? [];

export const lengthsFor = (cat: TubeProduct, shape: string, d: number) => rowsFor(cat, shape, d).map((r) => r.l);

/** null = this closure is not offered for that shape and diameter. */
export const closureStatus = (cat: TubeProduct, closure: string, shape: string, d: number): CompatStatus | null =>
  closureOf(cat, closure)?.compat[shape]?.[String(d)] ?? null;

export const closuresFor = (cat: TubeProduct, shape: string, d: number) =>
  cat.closures
    .map((c) => ({ closure: c.id, status: closureStatus(cat, c.id, shape, d) }))
    .filter((c): c is { closure: string; status: CompatStatus } => c.status !== null);

/** Closures that fit a shape at some diameter (the configurator lists these; others belong to other shapes). */
export const closuresForShape = (cat: TubeProduct, shape: string) => cat.closures.filter((c) => Object.keys(c.compat[shape] ?? {}).length > 0);

/** Nominal fill volume from the catalogue; null means "ask Arapoush" — never a formula. */
export const capacity = (cat: TubeProduct, c: TubeConfig): Capacity | null => {
  const row = rowsFor(cat, c.shape, c.d).find((r) => r.l === c.l);
  return row?.ml ? { ml: row.ml, status: row.status ?? "estimate" } : null;
};

/** Other sizes of the same shape and volume (different diameter). */
export const sameVolume = (cat: TubeProduct, c: TubeConfig) => {
  const cap = capacity(cat, c);
  if (!cap) return [];
  return diametersFor(cat, c.shape)
    .filter((d) => d !== c.d)
    .flatMap((d) => rowsFor(cat, c.shape, d).filter((r) => r.ml === cap.ml).map((r) => ({ d, l: r.l, ml: cap.ml })));
};

const preferred = (cat: TubeProduct, shape: string, d: number, want: string) => {
  const options = closuresFor(cat, shape, d);
  if (options.some((o) => o.closure === want)) return want;
  return (options.find((o) => o.status === "chart") ?? options[0])?.closure ?? null;
};

/**
 * Turns any input (URL, stale state, partial patch) into a producible configuration.
 * Unknown values snap to the nearest catalogue entry; closures fall back to a compatible one.
 */
export function normalize(cat: TubeProduct, input: Partial<Record<keyof TubeConfig, unknown>>): TubeConfig {
  const usable = cat.shapes.filter((s) => diametersFor(cat, s.id).some((d) => closuresFor(cat, s.id, d).length));
  if (!usable.length) throw new Error("Catalogue offers no producible tube");
  const shape = usable.find((s) => s.id === input.shape)?.id ?? usable.find((s) => s.id === DEFAULT_CONFIG.shape)?.id ?? usable[0]!.id;
  const ds = diametersFor(cat, shape).filter((d) => closuresFor(cat, shape, d).length);
  const dIn = Number(input.d);
  const d = Number.isFinite(dIn) && input.d !== "" && input.d != null ? nearest(ds, dIn) : nearest(ds, DEFAULT_CONFIG.d);
  const ls = lengthsFor(cat, shape, d);
  const lIn = Number(input.l);
  const l = Number.isFinite(lIn) && input.l !== "" && input.l != null ? nearest(ls, lIn) : nearest(ls, DEFAULT_CONFIG.l);
  const want = typeof input.closure === "string" ? input.closure : DEFAULT_CONFIG.closure;
  const closure = preferred(cat, shape, d, want)!;
  const structures = structuresFor(cat, shape, d, closure);
  const structure = structures.find((s) => s.id === input.structure)?.id ?? structures[0]?.id ?? "";
  return { shape, d, l, closure, structure };
}

/** Changing diameter keeps the volume as close as the new diameter allows (falls back to length). */
export function withDiameter(cat: TubeProduct, c: TubeConfig, d: number): TubeConfig {
  const cap = capacity(cat, c);
  const rows = rowsFor(cat, c.shape, d);
  const byVolume = cap
    ? rows.filter((r) => r.ml).reduce<SizeRow | null>((best, r) => (!best || Math.abs(r.ml! - cap.ml) < Math.abs(best.ml! - cap.ml) ? r : best), null)
    : null;
  return normalize(cat, { ...c, d, l: byVolume?.l ?? c.l });
}

export function withShape(cat: TubeProduct, c: TubeConfig, shape: string): TubeConfig {
  const ds = diametersFor(cat, shape);
  return normalize(cat, { ...c, shape, d: ds.length ? nearest(ds, c.d) : c.d });
}

/**
 * Product samples ordered by how well they match the selection:
 * shape first, then closure, then diameter. Samples of other shapes are dropped.
 */
export function rankSamples(cat: TubeProduct, c: TubeConfig) {
  return cat.samples
    .filter((s) => s.shape === c.shape)
    .map((s) => {
      const closure = s.closure === c.closure;
      const diameter = s.d === c.d;
      const score = (closure ? 4 : s.closure ? -1 : 0) + (diameter ? 2 : s.d != null ? -Math.min(2, Math.abs(s.d - c.d) / 10) : 0);
      // "exact" needs the sample to actually show the chosen closure; untagged ones only share the shape.
      return { sample: s, exact: closure && (s.d == null || diameter), score };
    })
    .sort((a, b) => b.score - a.score);
}

/** URL ⇄ config. Short keys keep shared links readable. */
export const toSearch = (c: TubeConfig) =>
  `shape=${encodeURIComponent(c.shape)}&d=${c.d}&l=${c.l}&cap=${encodeURIComponent(c.closure)}${c.structure ? `&st=${encodeURIComponent(c.structure)}` : ""}`;

export const fromSearch = (cat: TubeProduct, search: string | URLSearchParams) => {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  let shape = p.get("shape") ?? undefined;
  let closure = p.get("cap") ?? undefined;
  // Links from before v3 named a shoulder as a shape (shape=eyeNozzle): map it to a closure with that shoulder.
  if (shape && !shapeOf(cat, shape)) {
    const viaClosure = cat.closures.find((c) => c.shoulder === shape);
    if (viaClosure) {
      closure = viaClosure.id;
      shape = Object.keys(viaClosure.compat)[0];
    }
  }
  return normalize(cat, { shape, d: p.get("d") ?? undefined, l: p.get("l") ?? undefined, closure, structure: p.get("st") ?? undefined });
};

export const isValid = (cat: TubeProduct, c: TubeConfig) => {
  const n = normalize(cat, c);
  return n.shape === c.shape && n.d === c.d && n.l === c.l && n.closure === c.closure && n.structure === c.structure;
};
