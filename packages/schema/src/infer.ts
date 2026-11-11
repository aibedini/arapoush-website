import { isImage, isLocalizedImage, isLocalizedText, type Field, type GroupField } from "./fields.ts";

/**
 * Builds a field definition from existing content. Used once per type by the generator so the
 * schema matches exactly what the site renders today; overrides then add locks and limits.
 */
export function infer(value: unknown): Field {
  if (isLocalizedText(value)) return { kind: "text", localized: true, multiline: Object.values(value).some((s) => (s ?? "").length > 90) };
  if (isLocalizedImage(value)) return { kind: "image", perLocale: true };
  // A plain image only: objects that carry extra data next to src (render marks) stay groups.
  if (isImage(value) && Object.keys(value).every((k) => ["src", "width", "height", "alt"].includes(k))) return { kind: "image" };
  if (typeof value === "string") {
    if (/^\/(images|media)\/[^\s]+\.(webp|png|jpe?g|svg|avif|gif)$/i.test(value)) return { kind: "image", path: true };
    if (/^\/files\//.test(value)) return { kind: "file" };
    if (/^(https?:|mailto:|tel:)/.test(value)) return { kind: "url" };
    if (/^[/#]/.test(value)) return { kind: "url", internal: true };
    return { kind: "text", localized: false, multiline: value.length > 90 };
  }
  if (typeof value === "number") return { kind: "number", integer: Number.isInteger(value) };
  if (typeof value === "boolean") return { kind: "boolean" };
  if (value === null || value === undefined) return { kind: "text", localized: true };
  if (Array.isArray(value)) {
    const items = value.map(infer);
    const of = items.reduce<Field | null>((acc, f) => (acc ? merge(acc, f) : f), null) ?? { kind: "text", localized: true };
    const key = value.every((v) => v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") ? "id" : undefined;
    return { kind: "list", of, ...(key ? { key } : {}) };
  }
  const fields: Record<string, Field> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith("$")) continue;
    fields[k] = infer(v);
  }
  return { kind: "group", fields };
}

/** Merges two inferred shapes (list items differ: some carry optional keys). */
export function merge(a: Field, b: Field): Field {
  if (a.kind === "group" && b.kind === "group") {
    const fields: Record<string, Field> = { ...a.fields };
    for (const [k, f] of Object.entries(b.fields)) fields[k] = fields[k] ? merge(fields[k]!, f) : f;
    return { ...a, fields };
  }
  if (a.kind === "list" && b.kind === "list") return { ...a, of: merge(a.of, b.of) };
  if (a.kind === "text" && b.kind === "text") return { ...a, localized: a.localized || b.localized, multiline: a.multiline || b.multiline };
  if (a.kind === "image" && b.kind === "image") return { ...a, perLocale: a.perLocale || b.perLocale };
  return a;
}

export const asGroup = (f: Field): GroupField => (f.kind === "group" ? f : { kind: "group", fields: { value: f } });
