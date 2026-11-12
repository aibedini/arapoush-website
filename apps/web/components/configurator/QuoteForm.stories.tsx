import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { systemPublicForm } from "@arapoush/schema";
import fa from "@/lib/i18n/dictionaries/fa";
import contact from "@/content/contact.json";
import type { PublicForm } from "@/lib/forms";
import type { Department } from "@/lib/contactText";
import QuoteForm from "./QuoteForm";

/**
 * Tube page quote (T5): the OPEX form `tube-quote` with the configuration attached. After sending,
 * the ticket number and the sales team's lines and people. The API is answered by a fixture here.
 */
const form = systemPublicForm("tube-quote") as unknown as PublicForm;
const sales = (contact.directory.departments as unknown as Department[]).find((d) => d.id === "sales")!;

const meta = {
  title: "Product/Quote form",
  component: QuoteForm,
  args: {
    t: fa.productTube.configurator,
    forms: fa.forms,
    form,
    values: { shape: "circular", diameter: "30", length: "110", closure: "flipTop" },
    spec: ["گرد · Ø30 × 110 mm", "درب فلیپ‌تاپ پیچی", "چاپ: هات استمپ"],
    subjectSpec: "گرد Ø30 × 110 mm, درب فلیپ‌تاپ پیچی",
    search: "shape=circular&d=30&l=110&cap=flipTop",
    email: "sales@arapoush.com",
    locale: "fa",
    department: sales,
  },
  beforeEach: () => {
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/api/forms/tube-quote") ? new Response(JSON.stringify({ ok: true, number: 1042 }), { status: 201, headers: { "content-type": "application/json" } }) : real(input, init)) as typeof fetch;
    return () => {
      window.fetch = real;
    };
  },
} satisfies Meta<typeof QuoteForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** Choosing WhatsApp asks for a time; sending shows the ticket number and who to quote it to. */
export const SentWithTicket: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(await c.findByLabelText(/نام و نام خانوادگی/), "سارا کریمی");
    await userEvent.type(c.getByLabelText(/شمارهٔ تماس/), "09121234567");
    await userEvent.click(c.getByLabelText("واتساپ"));
    await expect(c.getByLabelText(/زمان مناسب/)).toBeVisible();
    // The site's spam guard needs a few seconds between showing and sending a form.
    await new Promise((r) => setTimeout(r, 2600));
    await userEvent.click(c.getByRole("button", { name: /ارسال درخواست قیمت/ }));
    await waitFor(() => expect(c.getByText("#1042")).toBeVisible());
    await expect(c.getByText(/فروش و سفارش/)).toBeVisible();
    await expect(c.getByRole("link", { name: /مهندس زیوری/ })).toHaveAttribute("href", "tel:+989912703900");
    // No email given: no "a copy was emailed" note.
    await expect(c.queryByText(/به ایمیل شما فرستاده شد/)).toBeNull();
  },
};
