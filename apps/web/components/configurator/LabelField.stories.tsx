import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import LabelField, { LABEL_DEFAULTS, type LabelOptions, type LabelText } from "./LabelField";
import type { LabelArt } from "@/lib/configurator/label";
import fa from "@/lib/i18n/dictionaries/fa";
import en from "@/lib/i18n/dictionaries/en";

/**
 * The visitor's own label on the configurator's tube: a JPG, PNG, SVG, PDF or Illustrator file read in
 * the browser (never uploaded), then placed on the front or all the way round, with size and height.
 */
const sample: LabelArt = {
  name: "my-brand-label.ai",
  width: 400,
  height: 240,
  src:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#d93340"/><rect x="20" y="20" width="360" height="200" fill="#fff"/><text x="60" y="140" font-size="44" font-family="sans-serif" fill="#1a2666">MY BRAND</text></svg>'),
};

function Field({ t, initial }: { t: LabelText; initial: LabelArt | null }) {
  const [art, setArt] = useState<LabelArt | null>(initial);
  const [opts, setOpts] = useState<LabelOptions>(LABEL_DEFAULTS);
  return (
    <div style={{ maxInlineSize: 420 }}>
      <p id="lb">{t.label}</p>
      <LabelField id="lb" t={t} art={art} options={opts} onArt={setArt} onOptions={setOpts} />
    </div>
  );
}

type Args = { t: LabelText; initial: LabelArt | null };
const meta: Meta<Args> = {
  title: "Configurator/LabelField",
  parameters: { layout: "padded" },
  render: (args) => <Field {...args} />,
};
export default meta;
type Story = StoryObj<Args>;

export const Empty: Story = {
  args: { t: fa.productTube.configurator, initial: null },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("button", { name: fa.productTube.configurator.labelUpload })).toBeVisible();
  },
};

export const WithArtwork: Story = {
  args: { t: en.productTube.configurator, initial: sample },
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("my-brand-label.ai")).toBeVisible();
    await expect(c.getByLabelText(en.productTube.configurator.labelSize)).toBeVisible();
    await userEvent.click(c.getByRole("radio", { name: en.productTube.configurator.labelWrap }));
    await expect(c.queryByLabelText(en.productTube.configurator.labelSize)).toBeNull();
    await userEvent.click(c.getByRole("button", { name: en.productTube.configurator.labelRemove }));
    await expect(c.getByRole("button", { name: en.productTube.configurator.labelUpload })).toBeVisible();
  },
};
