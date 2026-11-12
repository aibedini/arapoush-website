import { mergeChart, parseChart, type ChartCatalogue } from "@arapoush/schema";
import seed from "@arapoush/schema/generated/seed.json" with { type: "json" };
import { readXlsx } from "./xlsx.ts";

const V3 = (seed as unknown as Record<string, ChartCatalogue>)["product.tube.catalogue"]!;

/**
 * Catalogues from before v3 (no chart aliases, eye-nozzle as a shape) are upgraded first: shapes,
 * closures and colour families come from the v3 defaults; structures and samples are kept,
 * samples pointing at the old eye-nozzle shape move to the eye-nozzle closure.
 */
export function upgradeCatalogue(cat: ChartCatalogue): { catalogue: ChartCatalogue; upgraded: boolean } {
  if (Number(cat.version) >= 3) return { catalogue: cat, upgraded: false };
  const samples = ((cat.samples as { shape?: string; closure?: string }[] | undefined) ?? []).map((s) => (s.shape === "eyeNozzle" ? { ...s, shape: "circular", closure: "eyeNozzleLong" } : s));
  return { catalogue: { ...structuredClone(V3), structures: cat.structures ?? V3.structures, samples }, upgraded: true };
}

export type ChartFile = { name: string; bytes: Uint8Array };
export type ChartSummary = { file: string; shape: string | null; diameters: number[]; sizes: number; closures: string[] };

/**
 * Size charts → tube catalogue: each file is read, parsed and applied in turn to a copy of
 * `catalogue` (the current draft). Nothing is saved here; callers diff and save.
 */
export function importCharts(catalogue: ChartCatalogue, files: ChartFile[], o: { keepMissing?: boolean } = {}) {
  const up = upgradeCatalogue(catalogue);
  let cat = up.catalogue;
  const warnings: string[] = up.upgraded ? ["catalogue upgraded to v3: shapes, closures and colours now follow the size charts (structures and samples kept)"] : [];
  const charts: ChartSummary[] = [];
  const added: string[] = [];
  for (const f of files) {
    let grid;
    try {
      grid = readXlsx(f.bytes);
    } catch (e) {
      warnings.push(`${f.name}: ${(e as Error).message === "TOO_LARGE" ? "too many cells" : "not an Excel workbook (.xlsx)"}`);
      charts.push({ file: f.name, shape: null, diameters: [], sizes: 0, closures: [] });
      continue;
    }
    const parsed = parseChart(grid);
    const r = mergeChart(cat, parsed, o);
    cat = r.catalogue;
    added.push(...r.added);
    warnings.push(...r.warnings.map((w) => `${f.name}: ${w}`));
    charts.push({
      file: f.name,
      shape: r.shape,
      diameters: parsed.blocks.map((b) => b.d),
      sizes: parsed.blocks.reduce((n, b) => n + b.rows.length, 0),
      closures: [...new Set(parsed.blocks.flatMap((b) => b.closures.map((c) => c.label)))],
    });
  }
  return { catalogue: cat, warnings, charts, added };
}
