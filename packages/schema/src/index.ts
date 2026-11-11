import schemas from "./generated/schemas.json" with { type: "json" };
import type { ContentType } from "./fields.ts";

export * from "./fields.ts";
export * from "./paths.ts";
export * from "./sanitize.ts";
export * from "./validate.ts";
export * from "./localize.ts";
export { infer, merge, asGroup } from "./infer.ts";
export { applyOverrides, OVERRIDES, type Override } from "./overrides.ts";

/** Every content type OPEX manages (generated from the site, then reviewed in code). */
export const CONTENT_TYPES = schemas as unknown as ContentType[];

export function contentType(key: string): ContentType | undefined {
  return CONTENT_TYPES.find((t) => t.key === key);
}
export * from "./forms.ts";
