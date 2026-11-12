import { isBlockKind, TUBE_SECTIONS, type BlockProps, type LayoutSection } from "@arapoush/schema";

export type TubeSection = LayoutSection & { style?: string };

/**
 * The tube page's sections from content (T4). Unknown types and duplicate ids are dropped, an
 * unknown style falls back to the section's default, and the configurator is always kept: the
 * page is about it.
 */
export function normalizeTubeLayout(raw: unknown[]): TubeSection[] {
  const seen = new Set<string>();
  const out = (raw as Record<string, unknown>[]).flatMap((s): TubeSection[] => {
    const type = String(s?.type ?? "");
    const builtIn = type in TUBE_SECTIONS;
    if (!builtIn && !isBlockKind(type)) return [];
    const id = String(s.id ?? type).replace(/[^\w-]/g, "");
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const styles: readonly string[] = builtIn ? TUBE_SECTIONS[type as keyof typeof TUBE_SECTIONS].styles : [];
    const style = styles.includes(String(s.style)) ? String(s.style) : styles[0];
    const props = s.props && typeof s.props === "object" && !Array.isArray(s.props) ? (s.props as BlockProps) : undefined;
    return [{ id, type, enabled: s.enabled !== false, ...(style ? { style } : {}), ...(props ? { props } : {}) }];
  });
  if (!out.some((s) => s.type === "configurator")) out.splice(Math.min(1, out.length), 0, { id: "configurator", type: "configurator", enabled: true, style: "viewerStart" });
  return out;
}
