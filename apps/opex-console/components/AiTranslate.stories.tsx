import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { defaultOptions, TranslateFields, type TranslateOptions } from "./AiTranslate";

/**
 * AI translation controls (components/AiTranslate.tsx): the source language, several target
 * languages at once, "only empty values" or "translate everything again", and a note for the
 * translator. The same fields sit in the translate dialog of pages, sections and blog posts and on
 * the /translate page.
 */
const meta = { title: "Console/AI translation", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ initial }: { initial: TranslateOptions }) {
  const [o, setO] = useState(initial);
  return (
    <div className="card" style={{ maxInlineSize: 720 }}>
      <div className="card-body stack">
        <TranslateFields value={o} onChange={setO} />
        <output className="small muted" data-testid="choice">
          {o.from} → {o.to.join(",")} ({o.mode})
        </output>
      </div>
    </div>
  );
}

/** Persian to every other language; changing the source moves the targets with it. */
export const PersianToAll: Story = {
  render: () => <Demo initial={defaultOptions("fa")} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByTestId("choice")).toHaveTextContent("fa → en,tr (missing)");
    await userEvent.click(c.getByRole("checkbox", { name: "Türkçe" }));
    await expect(c.getByTestId("choice")).toHaveTextContent("fa → en (missing)");
    await userEvent.selectOptions(c.getByRole("combobox", { name: "زبان مبدأ" }), "en");
    await expect(c.getByTestId("choice")).toHaveTextContent("en → fa,tr (missing)");
    await userEvent.click(c.getByRole("radio", { name: /همه را دوباره ترجمه کن/ }));
    await expect(c.getByTestId("choice")).toHaveTextContent("(all)");
  },
};

/** Disabled while a translation runs. */
export const Busy: Story = {
  render: () => (
    <div className="card" style={{ maxInlineSize: 720 }}>
      <div className="card-body">
        <TranslateFields value={defaultOptions("fa")} onChange={() => {}} disabled />
      </div>
    </div>
  ),
};
