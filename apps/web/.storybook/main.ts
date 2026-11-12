import type { StorybookConfig } from "@storybook/nextjs-vite";
import { jsonImportAttributes } from "./json-attributes";

/**
 * Storybook for the website (D5, docs/DOCS-PLAN.md): reusable components only (forms, page-builder
 * blocks, buttons, configurator controls, header). Sections with GSAP/Three.js scenes are not
 * storied; their controls are. Every story is also a test: rendering, a11y (axe) and play functions
 * run with `pnpm --filter @arapoush/web test:stories`.
 */
const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)", "./**/*.mdx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  typescript: { reactDocgen: "react-docgen-typescript" },
  // @arapoush/schema imports its generated JSON with import attributes; see json-attributes.ts.
  viteFinal: async (cfg) => ({ ...cfg, plugins: [jsonImportAttributes(), ...(cfg.plugins ?? [])] }),
};
export default config;
