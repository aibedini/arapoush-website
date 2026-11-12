import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import raw from "@/content/products/multi-layer-tube.json";
import fa from "@/lib/i18n/dictionaries/fa";
import { normalize, type TubeProduct } from "@/lib/configurator/model";
import Samples from "./Samples";

/**
 * Tube page: related samples, ranked by shape, closure, print, diameter and cap colour (T4).
 * `style` is switched from OPEX: `grid` or a scrolling `rail`.
 */
const product = raw as unknown as TubeProduct;
const cfg = normalize(product, { shape: "circular", d: 30, l: 110, closure: "flipTop" });

const meta = {
  title: "Product/Samples",
  component: Samples,
  args: { t: fa.productTube.configurator, locale: "fa", product, cfg, onApply: fn() },
} satisfies Meta<typeof Samples>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // The flip-top sample matches the selection exactly and comes first.
    const first = c.getAllByRole("listitem")[0]!;
    await expect(within(first).getByText("منطبق با انتخاب شما")).toBeVisible();
  },
};

export const Rail: Story = { args: { style: "rail" } };
