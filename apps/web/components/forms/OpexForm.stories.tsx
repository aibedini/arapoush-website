import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { dict, mockFetch, sampleForm } from "../../.storybook/fixtures";
import OpexForm from "./OpexForm";

/**
 * A form built in OPEX (P11), rendered from its published definition. Validation and conditions run
 * with the same code OPEX uses (`@arapoush/schema`). The submit goes to `/api/forms/{slug}`; these
 * stories mock that answer.
 */
const meta = {
  title: "Forms/OpexForm",
  component: OpexForm,
  args: { form: sampleForm, page: "/fa/forms/sample-request", locale: "fa", t: dict("fa").forms },
  render: (args, { globals }) => <OpexForm {...args} locale={globals.locale ?? "fa"} t={dict(globals.locale).forms} />,
} satisfies Meta<typeof OpexForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const English: Story = { globals: { locale: "en" } };

/** Submitting empty shows the summary, marks each required field and moves focus to the summary. */
export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button"));
    await expect(await c.findByRole("alert")).toBeVisible();
    for (const box of c.getAllByRole("textbox").slice(0, 1)) await expect(box).toHaveAttribute("aria-invalid", "true");
  },
};

/** A field shown by a condition: "Diameter" appears only for the multi-layer tube. */
export const ConditionalField: Story = {
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByLabelText(/Diameter/)).toBeNull();
    await userEvent.click(c.getByLabelText("Multi-layer tube"));
    await expect(c.getByLabelText(/Diameter/)).toBeVisible();
  },
};

/** A complete submission: the success message and the ticket number (reference) appear. */
export const Sent: Story = {
  globals: { locale: "en" },
  beforeEach: () => mockFetch(201, { ok: true, number: 1042 }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText(/Full name/), "Sara Karimi");
    await userEvent.type(c.getByLabelText(/^Email/), "sara@example.com");
    await userEvent.click(c.getByLabelText("Effervescent tube"));
    await userEvent.click(c.getByLabelText(/You may contact me/));
    await userEvent.click(c.getByRole("button", { name: "Send" }));
    await expect(await c.findByText("Your request has arrived.")).toBeVisible();
    await expect(c.getByText("#1042")).toBeVisible();
  },
};

/** Too many requests from this visitor: an alert, the form stays filled. */
export const RateLimited: Story = {
  globals: { locale: "en" },
  beforeEach: () => mockFetch(429, { error: "rate_limited" }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText(/Full name/), "Sara");
    await userEvent.type(c.getByLabelText(/^Email/), "sara@example.com");
    await userEvent.click(c.getByLabelText("Effervescent tube"));
    await userEvent.click(c.getByLabelText(/You may contact me/));
    await userEvent.click(c.getByRole("button", { name: "Send" }));
    await expect(await c.findByRole("alert")).toHaveTextContent(dict("en").forms.limited);
  },
};
