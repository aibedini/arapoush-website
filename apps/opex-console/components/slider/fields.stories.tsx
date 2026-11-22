import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Colour, Num, Pick, Row, Seg, Texts, Toggle } from "./fields";

/**
 * The slider builder's inspector fields. Each row writes to the device being edited; a row that
 * overrides the desktop value on tablet or mobile shows a dot and a reset button.
 */
function Inspector({ device = "desktop" as "desktop" | "tablet" | "mobile" }) {
  const [x, setX] = useState<number | undefined>(device === "mobile" ? 12 : 0);
  const [colour, setColour] = useState<string | undefined>(device === "mobile" ? "#c0392b" : undefined);
  const [align, setAlign] = useState("start");
  const [anim, setAnim] = useState<string | undefined>("up");
  const [hidden, setHidden] = useState(false);
  const [title, setTitle] = useState<Record<string, string> | undefined>({ fa: "بسته‌بندی،\nاز نو." });
  const over = device !== "desktop";
  return (
    <div className="card" style={{ maxInlineSize: 340 }}>
      <div className="card-body ss-fields">
        <Row label="عنوان" wide>
          <Texts value={title} onChange={setTitle} multiline />
        </Row>
        <Row label="رنگ عنوان" device={device} over={over && !!colour} onReset={() => setColour(undefined)}>
          <Colour value={colour} onChange={setColour} />
        </Row>
        <Row label="جابه‌جایی افقی (٪ عرض)" device={device} over={over && x !== 0} onReset={() => setX(0)}>
          <Num value={x} onChange={setX} min={-100} max={100} unit="٪" />
        </Row>
        <Row label="چینش">
          <Seg value={align} options={[["start", "ابتدا"], ["center", "وسط"], ["end", "انتها"]] as const} onChange={setAlign} />
        </Row>
        <Row label="انیمیشن ورود">
          <Pick value={anim} options={[["fade", "محو"], ["up", "از پایین"], ["mask", "پرده"]] as const} onChange={setAnim} empty="بدون انیمیشن" />
        </Row>
        <Row label="پنهان در این دستگاه">
          <Toggle value={hidden} onChange={setHidden} label="پنهان" />
        </Row>
      </div>
    </div>
  );
}

const meta = { title: "Console/Slider fields", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop values: no overrides, every control named by its visible label. */
export const Desktop: Story = {
  render: () => <Inspector />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const x = c.getByRole("spinbutton", { name: "جابه‌جایی افقی (٪ عرض)" });
    await userEvent.clear(x);
    await userEvent.type(x, "20");
    await expect(x).toHaveValue(20);
    await userEvent.click(c.getByRole("button", { name: "وسط" }));
    await expect(c.getByRole("button", { name: "وسط" })).toHaveAttribute("aria-pressed", "true");
  },
};

/** Mobile overrides show a reset; resetting falls back to the desktop value. */
export const MobileOverride: Story = {
  render: () => <Inspector device="mobile" />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("textbox", { name: "رنگ عنوان" })).toHaveValue("#c0392b");
    const resets = c.getAllByRole("button", { name: /برگرداندن/ });
    await expect(resets).toHaveLength(2);
    await userEvent.click(resets[0]!);
    await expect(c.getByRole("textbox", { name: "رنگ عنوان" })).toHaveValue("");
  },
};

/** One text, three languages: switching the tab edits that language only. */
export const Languages: Story = {
  render: () => <Inspector />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /English/ }));
    const en = c.getByRole("textbox", { name: "عنوان (English)" });
    await userEvent.type(en, "Packaging");
    await expect(en).toHaveValue("Packaging");
  },
};
