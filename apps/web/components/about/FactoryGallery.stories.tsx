import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import raw from "@/content/about.json";
import ps from "@/components/printing/Printing.module.css";
import type { About } from "@/lib/aboutText";
import FactoryGallery from "./FactoryGallery";

/**
 * About page: factory photos (real content from content/about.json). `filmstrip` snaps one photo to
 * the centre with arrows, swipe and arrow keys; `mosaic` is a bento grid. `style` is switched from OPEX.
 */
const about = raw as unknown as About;
const meta = {
  title: "About/FactoryGallery",
  component: FactoryGallery,
  args: { c: about.gallery, locale: "fa" },
  render: (args, { globals }) => (
    <div className={ps.page}>
      <FactoryGallery {...args} locale={globals.locale ?? args.locale} />
    </div>
  ),
} satisfies Meta<typeof FactoryGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Filmstrip: Story = {};

/** The next arrow moves the strip on; the counter follows. */
export const FilmstripNext: Story = {
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("button", { name: "Previous photo" })).toBeDisabled();
    await userEvent.click(c.getByRole("button", { name: "Next photo" }));
    await expect(await c.findByText("2 of 8", {}, { timeout: 3000 })).toBeVisible();
  },
};

export const Mosaic: Story = { args: { c: { ...about.gallery, style: "mosaic" } } };
