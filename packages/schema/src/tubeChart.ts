/**
 * Arapoush size charts (Excel, one sheet per cross-section) → tube catalogue (T1).
 *
 * The charts are laid out in blocks, one per diameter:
 *   header row:  [shape label] قطر | ارتفاع | حجم | نوع درب ها …
 *   data rows:   Ø (first row only) | length | volume | closure names (first row) [| block colours]
 *   colour rows: "رنگ های قابل سفارش درب ها" then, under each closure column, the colours that
 *                closure comes in at this diameter ("-" = none).
 * Some blocks (Ø19) list colours on the first data row instead: they apply to every closure.
 *
 * Pure and dependency-free: the API reads the .xlsx into a grid of strings/numbers and calls
 * `parseChart`; `mergeChart` applies the result to a catalogue. Ids stay stable through aliases, so
 * share links and samples keep working; names nobody recognises become new entries with a warning.
 */

export type Cell = string | number | null;
export type Grid = Cell[][];

export const COLOUR_IDS = ["white", "coloured", "clear", "metallicSilver", "metallicGold"] as const;
export type ColourId = (typeof COLOUR_IDS)[number];

export type ChartBlock = { d: number; rows: { l: number; ml: number }[]; closures: { label: string; colours: ColourId[] }[] };
export type ParsedChart = { shapeLabel: string; blocks: ChartBlock[]; warnings: string[] };

const norm = (v: Cell) =>
  String(v ?? "")
    .replace(/[‌‏‎]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
const num = (v: Cell) => (typeof v === "number" ? v : /^\d+(\.\d+)?$/.test(norm(v).replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))) ? Number(norm(v).replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))) : null);

const isHeader = (row: Cell[]) => row.some((c) => norm(c) === "قطر") && row.some((c) => norm(c) === "ارتفاع");
const isColourHead = (row: Cell[]) => row.some((c) => norm(c).startsWith("رنگ های قابل سفارش"));

/** Chart wording → colour ids. "-" or empty means the closure has no option in that row. */
export function colourOf(text: Cell): ColourId[] | null {
  const t = norm(text);
  if (!t || t === "-") return [];
  if (t.startsWith("سفید")) return ["white"];
  if (t.startsWith("رنگی")) return ["coloured"];
  if (t.startsWith("شفاف")) return ["clear"];
  if (t.startsWith("متالایز")) {
    const silver = t.includes("نقره");
    const gold = t.includes("طلا");
    return [...(silver || !gold ? (["metallicSilver"] as const) : []), ...(gold || !silver ? (["metallicGold"] as const) : [])];
  }
  return null;
}

export function parseChart(grid: Grid): ParsedChart {
  const warnings: string[] = [];
  const blocks: ChartBlock[] = [];
  let shapeLabel = "";
  let cur: (ChartBlock & { cols: number[]; colourCols: number[]; lenCol: number; volCol: number; dCol: number; inColours: boolean }) | null = null;
  const close = () => {
    if (cur) blocks.push({ d: cur.d, rows: cur.rows, closures: cur.closures });
    cur = null;
  };

  grid.forEach((row, r) => {
    if (isHeader(row)) {
      close();
      const at = (label: string) => row.findIndex((c) => norm(c) === label);
      const dCol = at("قطر");
      shapeLabel ||= norm(row.slice(0, dCol).find((c) => norm(c)) ?? "");
      const capCol = row.findIndex((c) => norm(c).startsWith("نوع درب"));
      cur = { d: 0, rows: [], closures: [], cols: [], colourCols: [], dCol, lenCol: at("ارتفاع"), volCol: at("حجم"), inColours: false };
      if (capCol < 0) warnings.push(`row ${r + 1}: header without a closure column`);
      return;
    }
    const c = cur as typeof cur;
    if (!c) return;
    if (isColourHead(row) && !c.inColours) {
      c.inColours = true;
    }
    if (c.inColours) {
      // One colour per closure column per row; the row label sits in the first columns.
      c.cols.forEach((col, i) => {
        const v = colourOf(row[col] ?? null);
        if (v === null) warnings.push(`Ø${c.d}: unknown colour "${norm(row[col] ?? null)}" under "${c.closures[i]!.label}"`);
        else
          for (const id of v) {
            // The same colour twice in one column is usually a typo in the chart: keep it once, flag it.
            if (c.closures[i]!.colours.includes(id)) warnings.push(`Ø${c.d}: "${c.closures[i]!.label}" lists ${id} twice (check the chart)`);
            else c.closures[i]!.colours.push(id);
          }
      });
      return;
    }
    const l = num(row[c.lenCol] ?? null);
    const ml = num(row[c.volCol] ?? null);
    if (l === null) return;
    if (!c.d) {
      const d = num(row[c.dCol] ?? null);
      if (d === null) {
        warnings.push(`row ${r + 1}: block without a diameter`);
        return;
      }
      c.d = d;
      // Closure names (and, on some blocks, colours for all of them) follow the volume column.
      const blockColours: ColourId[] = [];
      row.forEach((cell, col) => {
        if (col <= c.volCol || !norm(cell)) return;
        const asColour = colourOf(cell);
        if (asColour && asColour.length) blockColours.push(...asColour.filter((x) => !blockColours.includes(x)));
        else {
          c.cols.push(col);
          c.closures.push({ label: norm(cell), colours: [] });
        }
      });
      if (blockColours.length) c.closures.forEach((x) => (x.colours = [...blockColours]));
    }
    if (ml === null) warnings.push(`Ø${c.d} × ${l}: no volume`);
    c.rows.push({ l, ml: ml ?? 0 });
  });
  close();
  if (!blocks.length) warnings.push("no size blocks found (expected a header row with قطر / ارتفاع / حجم)");
  return { shapeLabel, blocks, warnings };
}

/* ── Catalogue (v3) ── */

type Loc = Record<string, string>;
export type SizeRow = { l: number; ml?: number; status?: "chart" | "estimate" };
export type ChartShape = { id: string; aliases?: string[]; name: Loc; sizes: Record<string, SizeRow[]>; [k: string]: unknown };
export type ChartClosure = {
  id: string;
  aliases?: string[];
  name: Loc;
  model: string;
  compat: Record<string, Record<string, "chart" | "confirm">>;
  colours?: Record<string, Record<string, ColourId[]>>;
  [k: string]: unknown;
};
export type ChartCatalogue = { shapes: ChartShape[]; closures: ChartClosure[]; [k: string]: unknown };

const key = (s: string) => norm(s).replace(/\s/g, "");
const matches = (label: string, x: { id: string; aliases?: string[]; name: Loc }) => [x.id, x.name.fa ?? "", ...(x.aliases ?? [])].some((a) => key(a) === key(label));
const slug = (taken: Set<string>) => {
  let i = 1;
  while (taken.has(`closure${i}`)) i += 1;
  return `closure${i}`;
};

export type MergeOptions = {
  /** Keep diameters and closures the chart does not mention (default true): a chart is often partial. */
  keepMissing?: boolean;
};

/**
 * Applies a parsed chart to a catalogue copy. The chart is the truth for the diameters it lists:
 * their sizes, which closures fit (status "chart") and each closure's colours there.
 */
export function mergeChart(catalogue: ChartCatalogue, chart: ParsedChart, o: MergeOptions = {}) {
  const keep = o.keepMissing ?? true;
  const cat = structuredClone(catalogue);
  const warnings = [...chart.warnings];
  const shape = cat.shapes.find((s) => matches(chart.shapeLabel, s));
  if (!shape) return { catalogue: cat, warnings: [...warnings, `unknown shape "${chart.shapeLabel}": add it (or an alias) first`], shape: null, added: [] as string[] };

  const listed = new Set(chart.blocks.map((b) => String(b.d)));
  if (!keep) for (const d of Object.keys(shape.sizes)) if (!listed.has(d)) delete shape.sizes[d];
  for (const d of Object.keys(shape.sizes)) if (!listed.has(d)) warnings.push(`${shape.id} Ø${d} is not in the chart and was kept`);

  const added: string[] = [];
  const ids = new Set(cat.closures.map((c) => c.id));
  for (const b of chart.blocks) {
    const d = String(b.d);
    shape.sizes[d] = b.rows.map((r) => ({ l: r.l, ml: r.ml, status: "chart" as const }));
    const here = new Set<string>();
    for (const x of b.closures) {
      let cl = cat.closures.find((c) => matches(x.label, c));
      if (!cl) {
        cl = { id: slug(ids), aliases: [x.label], name: { fa: x.label }, model: "plain", compat: {}, colours: {} };
        ids.add(cl.id);
        cat.closures.push(cl);
        added.push(cl.id);
        warnings.push(`new closure "${x.label}" (${cl.id}): add its English/Turkish names, image and 3D family`);
      }
      here.add(cl.id);
      (cl.compat[shape.id] ??= {})[d] = "chart";
      ((cl.colours ??= {})[shape.id] ??= {})[d] = x.colours;
      if (!x.colours.length) warnings.push(`${cl.id} at ${shape.id} Ø${d}: no colours listed`);
    }
    // Closures the chart no longer lists for this diameter stop fitting it (unless kept as "confirm").
    for (const cl of cat.closures) {
      if (here.has(cl.id) || !cl.compat[shape.id]?.[d]) continue;
      if (cl.compat[shape.id]![d] === "chart" || !keep) {
        delete cl.compat[shape.id]![d];
        if (cl.colours?.[shape.id]) delete cl.colours[shape.id]![d];
        warnings.push(`${cl.id} no longer fits ${shape.id} Ø${d}`);
      }
    }
  }
  return { catalogue: cat, warnings, shape: shape.id, added };
}
