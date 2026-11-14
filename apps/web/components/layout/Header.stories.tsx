import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { dict } from "../../.storybook/fixtures";
import type { Locale } from "../../lib/i18n";
import Header from "./Header";

/**
 * The site header: logo, main navigation, search, language switch and the quote button. On small
 * screens the navigation folds into a menu button (accessible name changes open/close). The language
 * switch keeps the current path.
 */
const meta = {
  title: "Layout/Header",
  component: Header,
  args: { t: dict("fa"), locale: "fa", path: "/printing" },
  render: (args, { globals }) => <Header {...args} locale={(globals.locale ?? "fa") as Locale} t={dict(globals.locale)} />,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Header>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("navigation", { name: dict("fa").nav.main })).toBeVisible();
  },
};

export const English: Story = { globals: { locale: "en", viewport: { value: "desktop" } } };

/** Mobile: the menu button opens the navigation and its label switches to "close". */
export const MobileMenu: Story = {
  globals: { locale: "en", viewport: { value: "mobile" } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const t = dict("en");
    const button = c.getByRole("button", { name: t.nav.openMenu });
    await userEvent.click(button);
    await expect(c.getByRole("button", { name: t.nav.closeMenu })).toHaveAttribute("aria-expanded", "true");
    // The menu animation loads with its first open; let it settle before the accessibility check.
    await new Promise((r) => setTimeout(r, 1200));
  },
};

/** A blog post: "Journal" is in the menu even when OPEX's menu lacks it, and the language switch
 *  opens each translation's own slug (or the journal where there is none). */
export const BlogPost: Story = {
  args: { path: "/blog/tube", paths: { fa: "/blog/tube", en: "/blog", tr: "/blog" } },
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getAllByRole("link", { name: dict("fa").nav.journal })[0]).toHaveAttribute("href", "/fa/blog");
  },
};
