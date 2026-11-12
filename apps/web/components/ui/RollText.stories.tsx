import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import RollText from "./RollText";

/**
 * Button and link labels. The label rolls on hover with CSS only (`.roll` in globals.css); the
 * duplicate copy is aria-hidden, so the accessible name is the text once. Touch devices get the
 * `:active` press instead of hover. Button looks are the global `.btn` classes.
 */
const meta = {
  title: "UI/Buttons and RollText",
  component: RollText,
  args: { text: "Request a quote" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof RollText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  render: (args) => (
    <button type="button" className="btn">
      <RollText {...args} />
    </button>
  ),
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole("button", { name: args.text })).toBeVisible();
  },
};

export const Ghost: Story = {
  render: (args) => (
    <button type="button" className="btn btn--ghost">
      <RollText {...args} />
    </button>
  ),
};

export const LightOnDark: Story = {
  render: (args) => (
    <div style={{ background: "var(--navy)", padding: 32 }}>
      <a href="#contact" className="btn btn--light">
        <RollText {...args} />
      </a>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole("link", { name: args.text })).toHaveAttribute("href", "#contact");
  },
};

export const Persian: Story = {
  args: { text: "درخواست استعلام قیمت" },
  render: (args) => (
    <button type="button" className="btn">
      <RollText {...args} />
    </button>
  ),
};
