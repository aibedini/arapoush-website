import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import ChipGroup, { type ChipItem } from "./ChipGroup";

/**
 * The configurator's single-choice chips (shape, diameter, closure…). A radiogroup: the highlight
 * glides to the chosen chip, arrow keys move the choice and follow the reading direction (RTL-aware).
 */
const items: ChipItem[] = [
  { key: "round", content: "Round", label: "Round" },
  { key: "oval", content: "Oval", label: "Oval" },
  { key: "flat", content: "Flat", label: "Flat" },
];

function Controlled(props: { items: ChipItem[]; initial: string; onChange: (k: string) => void }) {
  const [value, setValue] = useState(props.initial);
  return (
    <div>
      <p id="shape-label">Tube shape</p>
      <ChipGroup
        items={props.items}
        value={value}
        labelledBy="shape-label"
        onChange={(k) => {
          setValue(k);
          props.onChange(k);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Configurator/ChipGroup",
  component: ChipGroup,
  args: { items, value: "round", onChange: fn(), labelledBy: "shape-label" },
  parameters: { layout: "padded" },
  render: (args) => <Controlled items={args.items} initial={args.value} onChange={args.onChange} />,
} satisfies Meta<typeof ChipGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("radiogroup", { name: "Tube shape" })).toBeVisible();
    await userEvent.click(c.getByRole("radio", { name: "Oval" }));
    await expect(args.onChange).toHaveBeenCalledWith("oval");
    await expect(c.getByRole("radio", { name: "Oval" })).toHaveAttribute("aria-checked", "true");
  },
};

/** Arrow keys move the choice (in Persian, ArrowLeft goes forward). */
export const KeyboardRtl: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    c.getByRole("radio", { name: "Round" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(args.onChange).toHaveBeenCalled();
  },
};

export const English: Story = { globals: { locale: "en" } };

/** Secondary rows (cap colour, print): the same chips without the gliding pill or its motion. */
export const Plain: Story = {
  args: { plain: true },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("radio", { name: "Oval" }));
    await expect(args.onChange).toHaveBeenCalledWith("oval");
    await expect(c.getByRole("radio", { name: "Oval" })).toHaveAttribute("aria-checked", "true");
  },
};
