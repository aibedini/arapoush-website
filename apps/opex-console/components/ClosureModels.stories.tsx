import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ClosureModels } from "./ClosureModels";

/**
 * Catalogue → 3D models (T2, T2.1): factory STEP/GLB dropped in bulk, matched to a closure and
 * diameter by file name, converted with a mounting read off the geometry, then approved one by one or
 * all confident ones together. The API is answered by fixtures here.
 */
const closures = [
  { id: "conical", name: { fa: "درب کونیکال", en: "Conical cap" }, compat: { circular: { "30": "chart" } } },
  { id: "flipTop", name: { fa: "درب فلیپ‌تاپ پیچی", en: "Screw-on flip-top cap" }, compat: { circular: { "30": "chart", "35": "chart" } }, model3d: { modelId: "cad_2" } },
  { id: "ovalFlipTop", name: { fa: "درب فلیپ‌تاپ پیچی بیضی", en: "Oval flip-top cap" }, compat: { oval: { "40": "chart" } } },
  { id: "bullet", name: { fa: "درب موشکی", en: "Bullet cap" }, compat: { circular: { "19": "chart" } } },
];
const shapes = [
  { id: "circular", model: "circular", name: { fa: "گرد" }, sizes: { "19": [], "30": [], "35": [] } },
  { id: "oval", model: "oval", name: { fa: "بیضی" }, sizes: { "40": [] } },
];
const models = [
  {
    id: "cad_1",
    closure_id: "conical",
    shape: null,
    diameter: null,
    source_name: "conical-cap.step",
    source_kind: "step",
    status: "needs_review",
    url: "#",
    bbox: { min: [-19, -13.5, 14], max: [-12, 13.5, 41], size: [7, 27, 27] },
    triangles: 1002,
    parts: 1,
    simplified: false,
    mounting: null,
    suggested: null,
    created_at: "2026-11-12T10:00:00Z",
    approved_at: null,
  },
  {
    id: "cad_3",
    closure_id: "flipTop",
    shape: "circular",
    diameter: 35,
    source_name: "35 فیلیپ تاپ.STEP",
    source_kind: "step",
    status: "needs_review",
    url: "#",
    bbox: { min: [-17.5, -17.5, -0.8], max: [17.5, 17.5, 29.2], size: [35, 35, 30] },
    triangles: 29138,
    parts: 1,
    simplified: false,
    mounting: null,
    suggested: { axis: "+Z", anchorMm: [0, 0, 0.7], neckDiameterMm: 21.1, confidence: "high", score: [18, 0] },
    created_at: "2026-11-13T10:00:00Z",
    approved_at: null,
  },
];
let calls: string[] = [];

const meta = {
  title: "Console/Closure models",
  component: ClosureModels,
  parameters: { layout: "padded" },
  beforeEach: () => {
    calls = [];
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (init?.method && init.method !== "GET") calls.push(`${init.method} ${url}`);
      if (url.includes("/v1/manage/auth/csrf")) return json({ csrf: "test" });
      if (url.includes("/v1/manage/entries/product.tube.catalogue")) return json({ draft: { id: "rev_1", data: { closures, shapes } } });
      if (url.endsWith("/approve")) return json({ model: {}, revision: { id: `rev_${calls.length + 1}`, number: 2 } });
      if (url.endsWith("/mounting")) return json({});
      if (url.includes("/v1/manage/catalogue/tube/models")) return json(models);
      return real(input, init);
    }) as typeof fetch;
    return () => {
      window.fetch = real;
    };
  },
} satisfies Meta<typeof ClosureModels>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {};

/** The suggestion from the geometry fills the form; without one, the top face's centre is the start. */
export const SuggestAnchor: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const card = (await c.findByText("conical-cap.step")).closest(".card") as HTMLElement;
    const k = within(card);
    await userEvent.selectOptions(k.getByLabelText("جهت دهانه (به سمت تیوب)"), "+X");
    await userEvent.click(k.getByRole("button", { name: "پیشنهاد از ابعاد" }));
    await expect(k.getByLabelText("نقطهٔ اتصال X (mm)")).toHaveValue(-19);
    await expect(k.getByLabelText("نقطهٔ اتصال Z (mm)")).toHaveValue(27.5);
    const flip = within((await c.findByText("35 فیلیپ تاپ.STEP")).closest(".card") as HTMLElement);
    await expect(flip.getByLabelText("جهت دهانه (به سمت تیوب)")).toHaveValue("+Z");
    await expect(flip.getByLabelText("قطر گلو (mm)")).toHaveValue(21.1);
  },
};

/** Files dropped together are matched by name: closure, shape and diameter. */
export const BulkQueue: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const input = await c.findByLabelText("انتخاب فایل‌های STEP یا GLB");
    const step = (name: string) => new File(["ISO-10303-21;"], name, { type: "application/octet-stream" });
    await userEvent.upload(input, [step("35 فیلیپ تاپ.STEP"), step("40 اوال فیلیپ تاپ.STEP"), step("کپ موشکی.STEP"), step("cap27.STEP")]);
    await expect(c.getByLabelText("درب برای 35 فیلیپ تاپ.STEP")).toHaveValue("flipTop");
    await expect(c.getByLabelText("قطر برای 35 فیلیپ تاپ.STEP")).toHaveValue("circular:35");
    await expect(c.getByLabelText("درب برای 40 اوال فیلیپ تاپ.STEP")).toHaveValue("ovalFlipTop");
    await expect(c.getByLabelText("قطر برای 40 اوال فیلیپ تاپ.STEP")).toHaveValue("oval:40");
    await expect(c.getByLabelText("درب برای کپ موشکی.STEP")).toHaveValue("bullet");
    await expect(c.getByLabelText("درب برای cap27.STEP")).toHaveValue("");
  },
};

/** Confident suggestions are saved as the mounting and approved, each on the newest draft. */
export const ApproveConfident: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: /تأیید همهٔ پیشنهادهای مطمئن/ }));
    await waitFor(() => expect(calls.filter((x) => x.endsWith("/approve"))).toHaveLength(1));
    await expect(calls.some((x) => x.includes("cad_3/mounting"))).toBe(true);
    await expect(calls.some((x) => x.includes("cad_1/"))).toBe(false);
  },
};
