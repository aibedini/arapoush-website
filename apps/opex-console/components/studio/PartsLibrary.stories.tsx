import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PartsLibrary } from "./PartsLibrary";
// A small converted model (OpenCascade's conical test part), so the stage really renders.
import glb from "./fixtures/conical.glb?url";

/**
 * 3D studio → parts library (S2): bodies and closures of every product line from factory STEP,
 * named, categorised, mounted and approved into `product.parts`. The API is answered by fixtures.
 */
const base = { source_kind: "step", url: glb, triangles: 18000, parts: 1, simplified: false, closure_id: null, created_at: "2026-11-28T10:00:00Z", approved_at: null };
const parts = [
  { ...base, id: "cad_b1", line: "effervescent", kind: "body", name: { fa: "بدنهٔ تیوب ۲۷", en: "Tube body 27" }, category: null, source_name: "eff-body-27.step", status: "approved", bbox: { min: [-14, 0, -14], max: [14, 150, 14], size: [28, 150, 28] }, mounting: { axis: "-X", anchorMm: [-19, 0, 27.5], neckDiameterMm: 10.9 }, suggested: null },
  { ...base, id: "cad_c1", line: "effervescent", kind: "closure", name: { fa: "درب فنری" }, category: "spiral", source_name: "eff-spiral-cap.step", status: "needs_review", bbox: { min: [-15, -15, 0], max: [15, 15, 22], size: [30, 30, 22] }, mounting: null, suggested: { axis: "+X", anchorMm: [-12, 0, 27.5], neckDiameterMm: 26.2, confidence: "high" } },
  { ...base, id: "cad_j1", line: "jar", kind: "body", name: null, category: null, source_name: "jar-50.step", status: "needs_review", bbox: { min: [-30, 0, -30], max: [30, 40, 30], size: [60, 40, 60] }, mounting: null, suggested: null },
];
let calls: string[] = [];

const meta = {
  title: "Console/Parts library",
  component: PartsLibrary,
  parameters: { layout: "padded" },
  beforeEach: () => {
    calls = [];
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method && init.method !== "GET") calls.push(`${init.method} ${url}`);
      if (url.includes(".glb")) return real(input, init);
      if (url.includes("/v1/manage/auth/csrf")) return json({ csrf: "test" });
      if (url.includes("/v1/manage/entries/product.parts")) return json({ draft: { id: "rev_1", data: { lines: [{ id: "effervescent", name: { fa: "تیوب قرص جوشان" } }] } } });
      if (url.endsWith("/approve")) return json({ part: {}, revision: { id: "rev_2", number: 2 } });
      if (url.includes("/v1/manage/catalogue/parts/")) return json({});
      if (url.includes("/v1/manage/catalogue/parts")) return init?.method === "POST" ? json(parts[1], 201) : json(parts);
      return real(input, init);
    }) as typeof fetch;
    return () => {
      window.fetch = real;
    };
  },
} satisfies Meta<typeof PartsLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Effervescent: Story = {};

/** Another line lists only its own parts. */
export const OtherLine: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.selectOptions(await c.findByLabelText("لاین محصول"), "jar");
    await expect(await c.findByRole("button", { name: /بدنه: jar-50\.step/ })).toBeInTheDocument();
    await expect(c.queryByRole("button", { name: /درب فنری/ })).toBeNull();
  },
};

/** Picking the closure fills the tools; the suggestion is the mounting, the colour is saved with approval. */
export const ApproveClosure: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: /درب: درب فنری/ }));
    await expect(await c.findByLabelText("قطر گلو (mm)")).toHaveValue(26.2);
    await userEvent.selectOptions(c.getByLabelText("جنس"), "gloss");
    await userEvent.click(c.getByRole("button", { name: "اعمال روی همه" }));
    await userEvent.click(c.getByRole("button", { name: /تأیید و افزودن به سایت/ }));
    await waitFor(() => expect(calls.some((x) => x.endsWith("cad_c1/approve"))).toBe(true));
    await expect(calls.some((x) => x.endsWith("cad_c1/mounting"))).toBe(true);
    await expect(calls.some((x) => x === "PUT /v1/manage/catalogue/parts/cad_c1")).toBe(true);
  },
};
