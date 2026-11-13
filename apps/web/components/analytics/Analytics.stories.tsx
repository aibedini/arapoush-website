import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Analytics from "./Analytics";

/**
 * Analytics from Settings → Analytics (S3). With consent on, a bar asks first and nothing loads
 * until the visitor accepts; the choice is remembered. Ids only: the tags are built in the component.
 */
const a = { ga4: "G-TEST1234", gtm: null, clarity: null, yandex: null, matomo: null, consent: true, verification: { google: null, bing: null, yandex: null } };
const meta = {
  title: "Layout/Analytics consent",
  component: Analytics,
  args: { a, locale: "fa" },
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    localStorage.removeItem("arapoush:analytics-consent");
    return () => localStorage.removeItem("arapoush:analytics-consent");
  },
} satisfies Meta<typeof Analytics>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AskPersian: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "نه، ممنون" }));
    await expect(c.queryByRole("button", { name: "موافقم" })).toBeNull();
  },
};

export const AskEnglish: Story = {
  args: { locale: "en" },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("button", { name: "Accept" })).toBeVisible();
  },
};
