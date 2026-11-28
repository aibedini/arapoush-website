import fallback from "@/content/products/parts.json";
import { entry } from "@/lib/content";

/**
 * The 3D studio's approved parts (`product.parts`), written in OPEX by approving a factory model.
 * Millimetres; a body's `axis` points out of its opening with `anchorMm` at the neck top, a closure's
 * `axis` points from its opening into it with `anchorMm` at its inner ceiling. Call ensureContent() first.
 */
export type Axis = "+Y" | "-Y" | "+X" | "-X" | "+Z" | "-Z";
export type Part = {
  id: string;
  line: string;
  kind: "body" | "closure" | "insert";
  category?: string;
  name?: Record<string, string>;
  src: string;
  axis: Axis;
  anchorMm: [number, number, number];
  neckDiameterMm: number;
  sizeMm: number[];
};
export type PartsLibrary = { lines: { id: string; name: Record<string, string> }[]; parts: Part[] };

export function getParts(): PartsLibrary {
  const e = entry<Partial<PartsLibrary>>("product.parts");
  return { lines: e?.lines ?? fallback.lines, parts: (e?.parts ?? (fallback.parts as Part[])) as Part[] };
}

export const findPart = (id: string | undefined) => (id ? getParts().parts.find((p) => p.id === id) : undefined);
