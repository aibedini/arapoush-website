import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { ClosureModels } from "./ClosureModels";

/**
 * Catalogue → 3D models (T2): factory STEP/GLB per closure, the converted size, the mounting form
 * (axis, anchor, neck Ø) and approval. The API is answered by fixtures here.
 */
const closures = [
  { id: "conical", name: { fa: "درب کونیکال", en: "Conical cap" } },
  { id: "flipTop", name: { fa: "درب فلیپ‌تاپ پیچی", en: "Screw-on flip-top cap" }, model3d: { modelId: "cad_2" } },
];
const models = [
  { id: "cad_1", closure_id: "conical", source_name: "conical-cap.step", source_kind: "step", status: "needs_review", url: "#", bbox: { min: [-19, -13.5, 14], max: [-12, 13.5, 41], size: [7, 27, 27] }, triangles: 1002, parts: 1, simplified: false, mounting: null, created_at: "2026-11-12T10:00:00Z", approved_at: null },
  { id: "cad_2", closure_id: "flipTop", source_name: "flip-top-30.stp", source_kind: "step", status: "approved", url: "#", bbox: { min: [-15, 0, -15], max: [15, 22, 15], size: [30, 22, 30] }, triangles: 48210, parts: 3, simplified: true, mounting: { axis: "+Y", anchorMm: [0, 22, 0], neckDiameterMm: 24, thread: "24/410" }, created_at: "2026-11-11T10:00:00Z", approved_at: "2026-11-11T11:00:00Z" },
];

const meta = {
  title: "Console/Closure models",
  component: ClosureModels,
  parameters: { layout: "padded" },
  beforeEach: () => {
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/v1/manage/entries/product.tube.catalogue")) return json({ draft: { id: "rev_1", data: { closures } } });
      if (url.includes("/v1/manage/catalogue/tube/models")) return json(models);
      return real(input);
    }) as typeof fetch;
    return () => {
      window.fetch = real;
    };
  },
} satisfies Meta<typeof ClosureModels>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {};

/** The anchor suggestion takes the centre of the face the opening points to; nothing is saved yet. */
export const SuggestAnchor: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const card = (await c.findByText("conical-cap.step")).closest(".card") as HTMLElement;
    const k = within(card);
    await userEvent.selectOptions(k.getByLabelText("جهت دهانه (به سمت تیوب)"), "+X");
    await userEvent.click(k.getByRole("button", { name: "پیشنهاد از ابعاد" }));
    await expect(k.getByLabelText("نقطهٔ اتصال X (mm)")).toHaveValue(-12);
    await expect(k.getByLabelText("نقطهٔ اتصال Z (mm)")).toHaveValue(27.5);
    await expect(k.getByRole("button", { name: /تأیید و استفاده/ })).toBeDisabled();
  },
};
