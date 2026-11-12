/**
 * The tube catalogue as the console edits it (OPEX entry `product.tube.catalogue`). The shapes mirror
 * `apps/web/lib/configurator/model.ts`; the website reads the same JSON. Pure helpers only: cascades
 * that keep references whole when an id is renamed or removed, and the checks the manager shows.
 */

export type Loc = { fa?: string; en?: string; tr?: string };
export type SizeRow = { l: number; ml?: number; status?: "chart" | "estimate" };
export type Fit = "chart" | "confirm";
export type ColourId = "white" | "coloured" | "clear" | "metallicSilver" | "metallicGold";
export type ShapeDef = { id: string; model: "circular" | "oval" | "eyeNozzle"; name: Loc; image: string; sizes: Record<string, SizeRow[]>; aliases?: string[] };
export type ClosureShape = { body?: "round" | "octagon"; oval?: boolean; width?: number; height?: number; top?: "flat" | "dome" | "cone" | "bullet"; topHeight?: number; ribs?: number; pump?: boolean };
export type ClosureDef = {
  id: string;
  model: "param" | "flipTop" | "screw" | "nozzle" | "standUp" | "plain";
  name: Loc;
  image: string;
  compat: Record<string, Record<string, Fit>>;
  colours?: Record<string, Record<string, ColourId[]>>;
  shoulder?: "circular" | "oval" | "eyeNozzle";
  shape3d?: ClosureShape;
  model3d?: { src: string; modelId?: string; axis: string; anchorMm: number[]; neckDiameterMm: number; sizeMm?: number[] };
  aliases?: string[];
};
export type ColourFamily = { id: ColourId; name: Loc; kind: "solid" | "custom" | "clear" | "metallic"; swatch: string; palette?: string[] };
export type BodyColour = { id: string; name: Loc; hex: string };
export type PrintDef = { id: string; name: Loc; effect: "flat" | "halftone" | "raised" | "foil" | "combo"; note?: Loc; colours?: number; foil?: string; artwork?: string; shapes?: string[]; diameters?: number[] };
export type LayerDef = { id: string; color: string; name: Loc; text: Loc };
export type StructureDef = { id: string; name: Loc; layers: LayerDef[]; shapes?: string[]; diameters?: number[]; closures?: string[] };
export type SampleDef = { id: string; image: string; shape: string; closure?: string; d?: number; print?: string; colour?: string; title: Loc };

export type Catalogue = {
  version?: number;
  updated?: string;
  shapes: ShapeDef[];
  closures: ClosureDef[];
  colourFamilies?: ColourFamily[];
  bodyColours?: BodyColour[];
  prints?: PrintDef[];
  structures: StructureDef[];
  samples: SampleDef[];
  [k: string]: unknown;
};

export const COLOUR_IDS: ColourId[] = ["white", "coloured", "clear", "metallicSilver", "metallicGold"];
export const SHAPE_MODELS: { id: ShapeDef["model"]; fa: string }[] = [
  { id: "circular", fa: "گرد" },
  { id: "oval", fa: "بیضی" },
  { id: "eyeNozzle", fa: "شانهٔ نازل چشمی" },
];
export const CLOSURE_MODELS: { id: ClosureDef["model"]; fa: string; hint: string }[] = [
  { id: "param", fa: "پارامتری", hint: "بدنهٔ گرد یا هشت‌ضلعی با سرِ تخت، گنبدی، مخروطی یا گلوله‌ای؛ اندازه‌ها نسبت به شعاع تیوب" },
  { id: "flipTop", fa: "فلیپ‌تاپ", hint: "درب لولایی" },
  { id: "screw", fa: "پیچی", hint: "درب پیچی ساده" },
  { id: "nozzle", fa: "نازل", hint: "نازل چشمی یا بلند با درپوش؛ «ارتفاع» طول درپوش است" },
  { id: "standUp", fa: "ایستاده", hint: "درب پهن که تیوب روی آن می‌ایستد" },
  { id: "plain", fa: "ساده", hint: "بدون جزئیات" },
];
export const PRINT_EFFECTS: { id: PrintDef["effect"]; fa: string }[] = [
  { id: "flat", fa: "رنگ تخت (فلکسو)" },
  { id: "halftone", fa: "ترام (افست)" },
  { id: "raised", fa: "برجسته (سیلک)" },
  { id: "foil", fa: "فویل متالایز" },
  { id: "combo", fa: "ترکیبی" },
];
export const FAMILY_KINDS: { id: ColourFamily["kind"]; fa: string }[] = [
  { id: "solid", fa: "یک رنگ ثابت" },
  { id: "custom", fa: "رنگ دلخواه با پالت" },
  { id: "clear", fa: "شفاف" },
  { id: "metallic", fa: "متالایز" },
];
export const FIT_FA: Record<Fit, string> = { chart: "در جدول", confirm: "نیاز به تأیید" };

export const ID_RE = /^[A-Za-z][A-Za-z0-9-]{0,47}$/;
export const HEX_RE = /^#[0-9a-f]{6}$/i;

export const locName = (l: Loc | undefined, fallback = "") => l?.fa || l?.en || l?.tr || fallback;
export const byNum = (a: string, b: string) => Number(a) - Number(b);
export const diametersOf = (s: ShapeDef | undefined) => Object.keys(s?.sizes ?? {}).sort(byNum);
/** Every diameter offered on any shape, ascending. */
export const allDiameters = (c: Catalogue) => [...new Set(c.shapes.flatMap((s) => diametersOf(s)))].sort(byNum).map(Number);
/** A fresh id: `base`, `base-2`, `base-3`… not used in `taken`. */
export const freshId = (base: string, taken: string[]) => {
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
};
const without = <T,>(rec: Record<string, T> | undefined, key: string) => {
  if (!rec) return rec;
  return Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));
};
const renameKey = <T,>(rec: Record<string, T> | undefined, from: string, to: string) =>
  rec ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k === from ? to : k, v])) : rec;

/** Closures, prints, structures and samples that mention a shape. */
export function shapeUses(c: Catalogue, id: string) {
  return {
    closures: c.closures.filter((x) => x.compat[id] || x.colours?.[id]).map((x) => x.id),
    prints: (c.prints ?? []).filter((p) => p.shapes?.includes(id)).map((p) => p.id),
    structures: c.structures.filter((s) => s.shapes?.includes(id)).map((s) => s.id),
    samples: c.samples.filter((s) => s.shape === id).map((s) => s.id),
  };
}

export function renameShape(c: Catalogue, from: string, to: string): Catalogue {
  return {
    ...c,
    shapes: c.shapes.map((s) => (s.id === from ? { ...s, id: to } : s)),
    closures: c.closures.map((x) => ({ ...x, compat: renameKey(x.compat, from, to)!, ...(x.colours ? { colours: renameKey(x.colours, from, to) } : {}) })),
    prints: c.prints?.map((p) => (p.shapes ? { ...p, shapes: p.shapes.map((s) => (s === from ? to : s)) } : p)),
    structures: c.structures.map((s) => (s.shapes ? { ...s, shapes: s.shapes.map((x) => (x === from ? to : x)) } : s)),
    samples: c.samples.map((s) => (s.shape === from ? { ...s, shape: to } : s)),
  };
}

/** Removes a shape and every fit, colour and limit that named it. Samples of the shape go too. */
export function removeShape(c: Catalogue, id: string): Catalogue {
  return {
    ...c,
    shapes: c.shapes.filter((s) => s.id !== id),
    closures: c.closures.map((x) => ({ ...x, compat: without(x.compat, id)!, ...(x.colours ? { colours: without(x.colours, id) } : {}) })),
    prints: c.prints?.map((p) => (p.shapes ? { ...p, shapes: p.shapes.filter((s) => s !== id) } : p)),
    structures: c.structures.map((s) => (s.shapes ? { ...s, shapes: s.shapes.filter((x) => x !== id) } : s)),
    samples: c.samples.filter((s) => s.shape !== id),
  };
}

/** Removes one diameter of a shape, with the closures' fits and colours at that diameter. */
export function removeDiameter(c: Catalogue, shape: string, d: string): Catalogue {
  return {
    ...c,
    shapes: c.shapes.map((s) => (s.id === shape ? { ...s, sizes: without(s.sizes, d)! } : s)),
    closures: c.closures.map((x) => ({
      ...x,
      compat: x.compat[shape] ? { ...x.compat, [shape]: without(x.compat[shape], d)! } : x.compat,
      ...(x.colours?.[shape] ? { colours: { ...x.colours, [shape]: without(x.colours[shape], d)! } } : {}),
    })),
  };
}

export const closureUses = (c: Catalogue, id: string) => ({
  structures: c.structures.filter((s) => s.closures?.includes(id)).map((s) => s.id),
  samples: c.samples.filter((s) => s.closure === id).map((s) => s.id),
});
export function renameClosure(c: Catalogue, from: string, to: string): Catalogue {
  return {
    ...c,
    closures: c.closures.map((x) => (x.id === from ? { ...x, id: to } : x)),
    structures: c.structures.map((s) => (s.closures ? { ...s, closures: s.closures.map((x) => (x === from ? to : x)) } : s)),
    samples: c.samples.map((s) => (s.closure === from ? { ...s, closure: to } : s)),
  };
}
export function removeClosure(c: Catalogue, id: string): Catalogue {
  return {
    ...c,
    closures: c.closures.filter((x) => x.id !== id),
    structures: c.structures.map((s) => (s.closures ? { ...s, closures: s.closures.filter((x) => x !== id) } : s)),
    samples: c.samples.map((s) => (s.closure === id ? { ...s, closure: undefined } : s)),
  };
}

export function renamePrint(c: Catalogue, from: string, to: string): Catalogue {
  return { ...c, prints: c.prints?.map((p) => (p.id === from ? { ...p, id: to } : p)), samples: c.samples.map((s) => (s.print === from ? { ...s, print: to } : s)) };
}
export function removePrint(c: Catalogue, id: string): Catalogue {
  return { ...c, prints: c.prints?.filter((p) => p.id !== id), samples: c.samples.map((s) => (s.print === id ? { ...s, print: undefined } : s)) };
}

/** Drops keys whose value is undefined, so the saved JSON stays as the website expects it. */
export function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export type Tab = "overview" | "shapes" | "closures" | "colours" | "prints" | "structures" | "samples" | "import" | "models";
export type Issue = { tab: Tab; id?: string; level: "bad" | "warn"; text: string };

const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

/** What the manager flags before saving. `bad` would break the configurator; `warn` is unfinished. */
export function validate(c: Catalogue): Issue[] {
  const out: Issue[] = [];
  const push = (tab: Tab, level: Issue["level"], text: string, id?: string) => out.push({ tab, id, level, text });
  const shapeIds = c.shapes.map((s) => s.id);
  const closureIds = c.closures.map((x) => x.id);
  const printIds = (c.prints ?? []).map((p) => p.id);

  const lists: [Tab, string, string[]][] = [
    ["shapes", "شکل", shapeIds],
    ["closures", "درب", closureIds],
    ["prints", "روش چاپ", printIds],
    ["structures", "ساختار", c.structures.map((s) => s.id)],
    ["samples", "نمونه", c.samples.map((s) => s.id)],
    ["colours", "رنگ بدنه", (c.bodyColours ?? []).map((b) => b.id)],
  ];
  for (const [tab, what, ids] of lists) {
    for (const id of new Set(dupes(ids))) push(tab, "bad", `شناسهٔ ${what} «${id}» تکراری است.`, id);
    for (const id of ids) if (!ID_RE.test(id)) push(tab, "bad", `شناسهٔ ${what} «${id || "خالی"}» معتبر نیست (حروف و عدد انگلیسی، با حرف شروع شود).`, id);
  }

  for (const s of c.shapes) {
    if (!s.name.fa) push("shapes", "warn", `نام فارسی شکل «${s.id}» خالی است.`, s.id);
    const ds = diametersOf(s);
    if (!ds.length) push("shapes", "bad", `شکل «${locName(s.name, s.id)}» هیچ قطری ندارد.`, s.id);
    for (const d of ds) {
      const rows = s.sizes[d] ?? [];
      if (!rows.length) push("shapes", "warn", `قطر ${d} در «${locName(s.name, s.id)}» هیچ طولی ندارد.`, s.id);
      if (rows.some((r) => !(r.l > 0))) push("shapes", "bad", `طول نامعتبر در قطر ${d} «${locName(s.name, s.id)}».`, s.id);
      if (dupes(rows.map((r) => String(r.l))).length) push("shapes", "bad", `طول تکراری در قطر ${d} «${locName(s.name, s.id)}».`, s.id);
    }
  }

  for (const x of c.closures) {
    const n = locName(x.name, x.id);
    if (!x.name.fa) push("closures", "warn", `نام فارسی درب «${x.id}» خالی است.`, x.id);
    if (!x.name.en || !x.name.tr) push("closures", "warn", `ترجمهٔ نام «${n}» کامل نیست.`, x.id);
    const fits = Object.values(x.compat).reduce((k, m) => k + Object.keys(m).length, 0);
    if (!fits) push("closures", "warn", `درب «${n}» روی هیچ قطری نمی‌نشیند و در پیکربندی دیده نمی‌شود.`, x.id);
    for (const [shape, m] of Object.entries(x.compat)) {
      const s = c.shapes.find((y) => y.id === shape);
      if (!s) push("closures", "bad", `«${n}» به شکل حذف‌شدهٔ «${shape}» اشاره دارد.`, x.id);
      else for (const d of Object.keys(m)) if (!s.sizes[d]) push("closures", "bad", `«${n}» به قطر ${d} اشاره دارد که «${locName(s.name, s.id)}» ندارد.`, x.id);
    }
    if (x.model === "param" && !x.shape3d) push("closures", "warn", `برای «${n}» شکل سه‌بعدی پارامتری تعریف نشده است.`, x.id);
    if (!x.image) push("closures", "warn", `«${n}» تصویر ندارد.`, x.id);
  }

  for (const f of c.colourFamilies ?? []) {
    if (!HEX_RE.test(f.swatch)) push("colours", "bad", `رنگ نمونهٔ «${locName(f.name, f.id)}» کد رنگ معتبر نیست.`, f.id);
    for (const h of f.palette ?? []) if (!HEX_RE.test(h)) push("colours", "bad", `«${h}» در پالت «${locName(f.name, f.id)}» کد رنگ معتبر نیست.`, f.id);
  }
  for (const b of c.bodyColours ?? []) if (!HEX_RE.test(b.hex)) push("colours", "bad", `کد رنگ بدنهٔ «${locName(b.name, b.id)}» معتبر نیست.`, b.id);

  for (const p of c.prints ?? []) {
    if (p.foil && !HEX_RE.test(p.foil)) push("prints", "bad", `رنگ فویل «${locName(p.name, p.id)}» معتبر نیست.`, p.id);
    for (const s of p.shapes ?? []) if (!shapeIds.includes(s)) push("prints", "bad", `«${locName(p.name, p.id)}» به شکل ناموجود «${s}» محدود شده است.`, p.id);
  }

  for (const s of c.structures) {
    if (!s.layers.length) push("structures", "bad", `ساختار «${locName(s.name, s.id)}» لایه ندارد.`, s.id);
    for (const l of s.layers) if (!HEX_RE.test(l.color)) push("structures", "bad", `رنگ لایهٔ «${locName(l.name, l.id)}» معتبر نیست.`, s.id);
    for (const x of s.closures ?? []) if (!closureIds.includes(x)) push("structures", "bad", `«${locName(s.name, s.id)}» به درب ناموجود «${x}» محدود شده است.`, s.id);
  }

  for (const s of c.samples) {
    const shape = c.shapes.find((y) => y.id === s.shape);
    const t = locName(s.title, s.id);
    if (!shape) push("samples", "bad", `نمونهٔ «${t}» شکل معتبر ندارد.`, s.id);
    if (s.closure && !closureIds.includes(s.closure)) push("samples", "bad", `نمونهٔ «${t}» به درب ناموجود اشاره دارد.`, s.id);
    if (s.print && !printIds.includes(s.print)) push("samples", "bad", `نمونهٔ «${t}» به روش چاپ ناموجود اشاره دارد.`, s.id);
    if (shape && s.d != null && !shape.sizes[String(s.d)]) push("samples", "warn", `قطر ${s.d} نمونهٔ «${t}» در این شکل نیست.`, s.id);
    if (!s.image) push("samples", "warn", `نمونهٔ «${t}» تصویر ندارد.`, s.id);
  }
  return out;
}
