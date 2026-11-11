import type { Field, GroupField } from "./fields.ts";
import { globMatch } from "./paths.ts";

/**
 * Schema overrides on top of inferred shapes: locks (3D, geometry, brand marks), operator-only
 * logic, labels and limits. `path` is a glob over field paths without selectors (`/shapes/sizes`);
 * `*` crosses any characters, so a pattern of star + "/model" matches a `model` field anywhere.
 */
export type Override = { type: string; path: string; set: Partial<Field> & Record<string, unknown> };

export const OVERRIDES: Override[] = [
  // Brand marks are not edited casually.
  { type: "global.site", path: "/images/logo*", set: { locked: true } },
  { type: "global.site", path: "/common/*", set: { operatorOnly: true } },
  { type: "global.site", path: "/contact/*", set: { operatorOnly: true } },
  { type: "global.site", path: "/social/*", set: { operatorOnly: true } },
  { type: "page.home.layout", path: "/sections", set: { operatorOnly: true } },

  // Tube configurator: geometry, compatibility and 3D model keys are code-owned in v1.
  { type: "product.tube.catalogue", path: "*/model", set: { locked: true } },
  { type: "product.tube.catalogue", path: "*/sizes", set: { locked: true } },
  { type: "product.tube.catalogue", path: "*/compat", set: { locked: true } },
  { type: "product.tube.catalogue", path: "/structures/layers", set: { locked: true } },
  { type: "product.tube.catalogue", path: "/samples/shape", set: { locked: true } },
  { type: "product.tube.catalogue", path: "/samples/closure", set: { locked: true } },
  { type: "product.tube.catalogue", path: "*/id", set: { locked: true } },
  { type: "product.tube.catalogue", path: "/version", set: { locked: true } },
  { type: "product.tube.catalogue", path: "/updated", set: { locked: true } },

  // Effervescent: sizes, render marks, cap marker positions and 3D renders are measured or rendered.
  { type: "product.effervescent.page", path: "/data/sizes", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/defaultSize", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/renderPxPerMm", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/caps/variants/parts", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/caps/variants/image", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/caps/variants/id", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/images/poster", set: { locked: true } },
  { type: "product.effervescent.page", path: "/data/images/uses", set: { locked: true } },

  // Printing: method ids and the guide's scoring are logic, not copy.
  { type: "page.printing", path: "/tech/items/id", set: { locked: true } },
  { type: "page.printing", path: "/tech/items/sample", set: { operatorOnly: true } },
  { type: "page.printing", path: "/guide/questions/options/effects", set: { operatorOnly: true } },
  { type: "page.printing", path: "/guide/questions/options/excludes", set: { operatorOnly: true } },
  { type: "page.printing", path: "/guide/questions/options/asks", set: { operatorOnly: true } },
  { type: "page.printing", path: "/guide/questions/id", set: { locked: true } },
  { type: "page.printing", path: "/guide/questions/options/id", set: { locked: true } },
  { type: "page.printing", path: "/samples/items/method", set: { operatorOnly: true } },
  { type: "page.printing", path: "/compare/rows", set: { operatorOnly: false } },

  // Every list keyed by id keeps its ids stable (grants, paths and the site rely on them).
  { type: "*", path: "*/id", set: { locked: true } },
];

/** Applies overrides in order; later rules win. Returns a new schema. */
export function applyOverrides(typeKey: string, schema: GroupField, rules: Override[] = OVERRIDES): GroupField {
  const relevant = rules.filter((r) => globMatch(r.type, typeKey));
  const visit = (f: Field, path: string): Field => {
    let out: Field = f;
    for (const r of relevant) if (globMatch(r.path, path)) out = { ...out, ...r.set } as Field;
    if (out.kind === "group") return { ...out, fields: Object.fromEntries(Object.entries(out.fields).map(([k, c]) => [k, visit(c, `${path}/${k}`)])) };
    if (out.kind === "list") return { ...out, of: visit(out.of, path) };
    return out;
  };
  return visit(schema, "") as GroupField;
}
