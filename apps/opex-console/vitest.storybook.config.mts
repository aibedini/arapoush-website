import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { jsonImportAttributes } from "./.storybook/json-attributes";

/**
 * Stories as tests (D5): each story renders in a real browser, its play function runs, and axe
 * checks accessibility (a11y.test = "error" fails on violations). Locally it uses the installed
 * Chrome; CI installs Playwright's Chromium.
 */
export default defineConfig({
  plugins: [jsonImportAttributes(), storybookTest({ configDir: ".storybook" })],
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(process.env.CI ? {} : { launchOptions: { channel: "chrome" } }),
      instances: [{ browser: "chromium" }],
    },
  },
});
