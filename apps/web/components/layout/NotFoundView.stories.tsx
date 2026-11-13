import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import NotFoundView from "./NotFoundView";

/** The localized 404: what went wrong and four ways back into the site (SEO audit). */
const meta = {
  title: "Layout/Not found",
  component: NotFoundView,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/fa/missing" } } },
} satisfies Meta<typeof NotFoundView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Persian: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { level: 1, name: "این صفحه پیدا نشد" })).toBeVisible();
    await expect(c.getByRole("link", { name: "صفحه اصلی" })).toHaveAttribute("href", "/fa");
  },
};

export const English: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/en/missing" } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/en/contact");
  },
};
