import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import raw from "@/content/about.json";
import ps from "@/components/printing/Printing.module.css";
import type { About } from "@/lib/aboutText";
import Honours from "./Honours";

/**
 * About page: honours and certificates (real content from content/about.json). Each document shows
 * what it means, the year, what it was awarded for and who issued it; the filter narrows by kind
 * and the viewer opens the document with its other copies. `style` is switched from OPEX.
 */
const about = raw as unknown as About;
const meta = {
  title: "About/Honours",
  component: Honours,
  args: { c: about.honours, locale: "fa" },
  render: (args, { globals }) => (
    <div className={ps.page}>
      <Honours {...args} locale={globals.locale ?? args.locale} />
    </div>
  ),
} satisfies Meta<typeof Honours>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Wall: Story = {};

/** The filter keeps only licences and documents; the viewer opens on a card. */
export const FilterAndView: Story = {
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /Licences and documents/ }));
    await expect(c.getByRole("button", { name: /Licences and documents/ })).toHaveAttribute("aria-pressed", "true");
    await expect(c.queryByText("Kiwa GMP certificate")).toBeNull();
    // Let the cards finish their entrance so axe checks them at full opacity.
    await Promise.all(canvasElement.ownerDocument.getAnimations().map((a) => a.finished));
    await userEvent.click(c.getByRole("button", { name: /View document.*Operating licence/ }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Operating licence" });
    await Promise.all(canvasElement.ownerDocument.getAnimations().map((a) => a.finished));
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  },
};

export const List: Story = { args: { c: { ...about.honours, style: "list" } } };
