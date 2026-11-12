import { unzipSync, strFromU8 } from "fflate";
import type { Grid } from "@arapoush/schema";

/**
 * Minimal .xlsx reader for the size charts: the first worksheet as a grid of values (shared and
 * inline strings, numbers). Formulas give their cached value; styles, merges and images are
 * ignored (a merged range keeps its value in its top-left cell, which is what the chart parser
 * reads). Throws `Error("NOT_XLSX")` for anything that is not a workbook.
 */
const MAX_CELLS = 50_000;

const unescape = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (_, n: string, dec?: string, hex?: string) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[n.toLowerCase()]!,
  );
const texts = (xml: string) => Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (m) => unescape(m[1]!)).join("");

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};

export function readXlsx(bytes: Uint8Array): Grid {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || f.name === "xl/sharedStrings.xml" || f.name.startsWith("xl/worksheets/sheet") });
  } catch {
    throw new Error("NOT_XLSX");
  }
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new Error("NOT_XLSX");
  // First sheet in workbook order, through its relationship id.
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(strFromU8(wb))?.[1];
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  const path = target ? `xl/${target.replace(/^\/?xl\//, "")}` : "xl/worksheets/sheet1.xml";
  const sheet = files[path] ?? files["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new Error("NOT_XLSX");

  const shared = files["xl/sharedStrings.xml"] ? Array.from(strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g), (m) => texts(m[1]!)) : [];
  const grid: Grid = [];
  let count = 0;
  for (const m of strFromU8(sheet).matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    if (++count > MAX_CELLS) throw new Error("TOO_LARGE");
    const attrs = m[1]!;
    const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
    const body = m[2] ?? "";
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let value: string | number | null = null;
    if (type === "s" && v !== undefined) value = shared[Number(v)] ?? null;
    else if (type === "inlineStr") value = texts(body);
    else if (type === "str" || type === "e") value = v !== undefined ? unescape(v) : null;
    else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
    else if (v !== undefined) value = Number(v);
    const r = Number(ref[2]) - 1;
    const c = colIndex(ref[1]!);
    (grid[r] ??= [])[c] = value;
  }
  // Dense rows (holes → null) so callers can index safely.
  for (let r = 0; r < grid.length; r++) grid[r] = Array.from({ length: grid[r]?.length ?? 0 }, (_, c) => grid[r]?.[c] ?? null);
  return grid;
}
