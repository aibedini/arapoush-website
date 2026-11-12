import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import seed from "@arapoush/schema/generated/seed.json";
import { CatalogueManager } from "./CatalogueManager";

/**
 * Catalogue → tube catalogue manager: every tab edits one local draft, the bottom bar saves it and
 * the header publishes. The API is answered by fixtures (the generated seed catalogue) here.
 */
const catalogue = (seed as Record<string, unknown>)["product.tube.catalogue"];
let saved: { data: Record<string, unknown>; base_revision_id: string | null } | null = null;

const meta = {
  title: "Console/Tube catalogue manager",
  component: CatalogueManager,
  beforeEach: () => {
    saved = null;
    history.replaceState(null, "", "#overview");
    localStorage.removeItem("opex:unsaved:product.tube.catalogue");
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/v1/manage/entries/product.tube.catalogue") && init?.method === "PUT") {
        saved = JSON.parse(String(init.body));
        return json({ ok: true });
      }
      if (url.includes("/v1/manage/entries/product.tube.catalogue"))
        return json({ entry: { draft_revision_id: "rev_2", published_revision_id: "rev_1" }, draft: { id: "rev_2", number: 2, data: catalogue, created_at: "2026-11-12T10:00:00Z" } });
      if (url.includes("/v1/manage/auth/csrf")) return json({ csrf: "test" });
      if (url.includes("/v1/manage/catalogue/tube/models")) return json([]);
      return real(input, init);
    }) as typeof fetch;
    return () => {
      window.fetch = real;
    };
  },
} satisfies Meta<typeof CatalogueManager>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("tab", { name: /نمای کلی/ })).toHaveAttribute("aria-selected", "true");
    await expect(c.getByText("نقشهٔ سازگاری درب‌ها")).toBeVisible();
  },
};

/** A closure's fit per diameter; a new fit starts with its neighbour's colours. Undo puts it back. */
export const ClosureFit: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("tab", { name: /درب‌ها/ }));
    const fit = await c.findByLabelText("گرد Ø60: سازگاری");
    await userEvent.selectOptions(fit, "confirm");
    await expect(c.getByLabelText("گرد Ø60: سفید")).toBeEnabled();
    await expect(c.getByRole("region", { name: "ذخیرهٔ پیش‌نویس" })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: /برگرداندن/ }));
    await expect(c.getByLabelText("گرد Ø60: سازگاری")).toHaveValue("");
  },
};

/** Lengths are added in one go and kept in order. */
export const ShapeSizes: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("tab", { name: /شکل‌ها و سایزها/ }));
    await userEvent.click(await c.findByRole("button", { name: /^Ø19/ }));
    const before = c.getAllByLabelText(/^طول ردیف/).length;
    await userEvent.type(c.getByLabelText(/افزودن طول‌ها/), "57 200{Enter}");
    await waitFor(() => expect(c.getAllByLabelText(/^طول ردیف/)).toHaveLength(before + 2));
    const values = c.getAllByLabelText(/^طول ردیف/).map((i) => Number((i as HTMLInputElement).value));
    await expect(values).toEqual([...values].sort((a, b) => a - b));
  },
};

/** Renaming a closure id renames it in samples and structures too, and saves against the draft. */
export const RenameAndSave: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("tab", { name: /درب‌ها/ }));
    await userEvent.click(await c.findByRole("button", { name: /^درب فلیپ‌تاپ پیچی فلیپ‌تاپ/ }));
    const id = c.getByLabelText("شناسه");
    await userEvent.clear(id);
    await userEvent.type(id, "flipTopCap{Enter}");
    await userEvent.click(c.getByRole("button", { name: /ذخیرهٔ پیش‌نویس/ }));
    await waitFor(() => expect(saved).not.toBeNull());
    const data = saved!.data as { closures: { id: string }[]; samples: { closure?: string }[] };
    await expect(saved!.base_revision_id).toBe("rev_2");
    await expect(data.closures.some((x) => x.id === "flipTopCap")).toBe(true);
    await expect(data.samples.some((s) => s.closure === "flipTop")).toBe(false);
    await expect(data.samples.some((s) => s.closure === "flipTopCap")).toBe(true);
  },
};
