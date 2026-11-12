import type { Plugin } from "vite";

/**
 * Storybook only: @arapoush/schema imports its generated JSON with `with { type: "json" }` (Node
 * needs it). Vite imports JSON natively, and a transform in the chain rewrites the attribute to the
 * removed `assert` form, which Chrome rejects. Dropping the attribute here keeps both happy.
 */
export function jsonImportAttributes(): Plugin {
  return {
    name: "arapoush:json-import-attributes",
    enforce: "pre",
    transform(code, id) {
      if (!/\.(ts|tsx|js|mjs)$/.test(id) || !/\b(with|assert)\s*\{\s*type:\s*["']json["']\s*\}/.test(code)) return null;
      return { code: code.replace(/\s+(with|assert)\s*\{\s*type:\s*["']json["']\s*\}/g, ""), map: null };
    },
  };
}
