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
  },
};
