import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import raw from "@/content/contact.json";
import ps from "@/components/printing/Printing.module.css";
import cs from "./Contact.module.css";
import type { Contact } from "@/lib/contactText";
import Directory from "./Directory";

/**
 * Contact page: the department directory (real content from content/contact.json). Each department
 * lists its lines, email and people with extension and mobile. `style` is switched from OPEX:
 * `tabs` (one department at a time) or `grid` (all as cards).
 */
const contact = raw as unknown as Contact;
const meta = {
  title: "Contact/Directory",
  component: Directory,
  args: { c: contact.directory, locale: "fa" },
  render: (args, { globals }) => (
    <div className={`${ps.page} ${cs.page}`}>
      <Directory {...args} locale={globals.locale ?? args.locale} />
    </div>
  ),
} satisfies Meta<typeof Directory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tabs: Story = {};

export const Grid: Story = { args: { c: { ...contact.directory, style: "grid" } } };

/** Arrow keys move between departments (reversed in Persian); the panel follows. */
export const KeyboardTabs: Story = {
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const sales = c.getByRole("tab", { name: "Sales and orders" });
    await userEvent.click(sales);
    await userEvent.keyboard("{ArrowRight}");
    const design = c.getByRole("tab", { name: "Design and artwork" });
    await expect(design).toHaveAttribute("aria-selected", "true");
    await expect(design).toHaveFocus();
    // The panel fades in; wait for it before checking visibility.
    await Promise.all(canvasElement.ownerDocument.getAnimations().map((a) => a.finished));
    await expect(c.getByRole("tabpanel", { name: "Design and artwork" })).toBeVisible();
    await userEvent.keyboard("{End}");
    await expect(c.getByRole("tab", { name: "People and careers" })).toHaveAttribute("aria-selected", "true");
  },
};

/** Every mobile is a tel: link in international form. */
export const MobileLinks: Story = {
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: /Mobile Mr Zivari: 0991-270-3900/ });
    await expect(link).toHaveAttribute("href", "tel:+989912703900");
  },
};
