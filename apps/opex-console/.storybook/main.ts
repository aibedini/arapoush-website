import type { StorybookConfig } from "@storybook/nextjs-vite";
import { jsonImportAttributes } from "./json-attributes";

/**
 * Storybook for the OPEX console (D5): the shared UI kit and the content field editor. Pages that need
 * the API are not storied. Stories are tests: `pnpm --filter @arapoush/opex-console test:stories`.
 */
const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  core: { disableTelemetry: true },
  typescript: { reactDocgen: "react-docgen-typescript" },
  viteFinal: async (cfg) => ({ ...cfg, plugins: [jsonImportAttributes(), ...(cfg.plugins ?? [])] }),
};
export default config;
