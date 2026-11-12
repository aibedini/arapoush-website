import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import type { Field } from "@arapoush/schema";
import { FieldEditor, LocaleViewContext, type LocaleView } from "./FieldEditor";

/**
 * The content field editor (P13): one component renders any schema field. Localized text shows one
 * language at a time (or all three) with "not translated" hints; lists are collapsible with
 * move/delete buttons; changed fields get a margin marker.
 */
function Harness({ field, initial, view = "fa" }: { field: Field; initial: unknown; view?: LocaleView }) {
  const [value, setValue] = useState(initial);
  return (
    <LocaleViewContext.Provider value={view}>
      <div className="card">
        <div className="card-body">
          <FieldEditor field={field} name="title" path="/title" value={value} orig={initial} onChange={setValue} ctx={{ canEdit: true, superAdmin: false }} />
        </div>
      </div>
    </LocaleViewContext.Provider>
  );
}

const meta = { title: "Console/FieldEditor", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const text: Field = { kind: "text", localized: true, max: 120 };

/** Persian only; English is empty, so it is flagged as not translated in the "all" view. */
export const LocalizedText: Story = {
  render: () => <Harness field={text} initial={{ fa: "بسته‌بندی، از نو." }} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const input = c.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "تیوب‌های چندلایه");
    await expect(input).toHaveValue("تیوب‌های چندلایه");
  },
};

export const AllLanguages: Story = {
  render: () => <Harness field={text} initial={{ fa: "بسته‌بندی، از نو.", en: "Packaging, reimagined." }} view="all" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("textbox")).toHaveLength(3);
    await expect(within(canvasElement).getByText("ترجمه نشده")).toBeVisible();
  },
};

const list: Field = { kind: "list", of: { kind: "group", fields: { title: text, text: { kind: "text", localized: true, multiline: true } } } };

/** Items are titled by their content; move and delete buttons have spoken labels. */
export const ListOfItems: Story = {
  render: () => (
    <Harness
      field={list}
      initial={[
        { title: { fa: "آرایشی" }, text: { fa: "کرم‌ها و ژل‌ها" } },
        { title: { fa: "دارویی" }, text: { fa: "پمادها" } },
        { title: { fa: "غذایی" }, text: { fa: "سس‌ها" } },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("دارویی")).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "پایین بردن مورد 1" }));
    await expect(c.getAllByText(/آرایشی|دارویی/)[0]).toHaveTextContent("دارویی");
  },
};

export const Choice: Story = { render: () => <Harness field={{ kind: "enum", values: ["light", "dark"] }} initial="light" /> };
