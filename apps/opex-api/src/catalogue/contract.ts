import { z } from "zod";
import { route } from "../openapi/contract.ts";

const S = "catalogue/routes.ts";
const tags = ["Catalogue"];

export const MAX_CHART_BYTES = 2 * 1024 * 1024;

export const ImportBody = z.strictObject({
  files: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(200).describe("File name, for the report."),
        data: z
          .string()
          .max(Math.ceil((MAX_CHART_BYTES * 4) / 3) + 4)
          .describe("The .xlsx file, base64 (2 MB at most)."),
      }),
    )
    .min(1)
    .max(6),
  keep_missing: z.boolean().default(true).describe("Keep diameters and closures a chart does not mention (charts are often partial)."),
  apply: z.boolean().default(false).describe("false: preview only. true: save the result as a new draft."),
  base_revision_id: z.string().max(40).nullable().optional().describe("The draft you previewed against; required with apply."),
  note: z.string().max(500).optional(),
});

export const Axis = z.enum(["+Y", "-Y", "+X", "-X", "+Z", "-Z"]).describe("Direction from the cap's mounting face towards the tube (the opening), in the model's own axes.");
export const Mounting = z
  .strictObject({
    axis: Axis,
    anchorMm: z.tuple([z.number(), z.number(), z.number()]).describe("Point on the mounting face that sits on the top of the tube neck, in model millimetres."),
    neckDiameterMm: z.number().positive().max(120).describe("Neck (thread) diameter the cap is made for."),
    thread: z.string().max(60).optional().describe("Thread designation, if any (e.g. 24/410)."),
  })
  .meta({ id: "Mounting" });
export const Suggested = z
  .object({
    axis: Axis,
    anchorMm: z.tuple([z.number(), z.number(), z.number()]),
    neckDiameterMm: z.number(),
    confidence: z.enum(["high", "low"]).describe("high: one side is clearly an open, walled, round pit. low: check it in the preview."),
    score: z.tuple([z.number(), z.number()]).describe("Pit strength of the best side and of the runner-up."),
  })
  .meta({ id: "SuggestedMounting" });
export const CadModel = z
  .object({
    id: z.string(),
    closure_id: z.string(),
    shape: z.string().nullable().describe("Catalogue shape the model is for; null: every shape."),
    diameter: z.number().nullable().describe("Tube diameter (mm) the model is for; null: every diameter."),
    source_name: z.string(),
    source_kind: z.enum(["step", "glb"]),
    status: z.enum(["needs_review", "approved", "archived"]),
    url: z.string().describe("The converted GLB (console preview path until published)."),
    bbox: z.object({ min: z.array(z.number()), max: z.array(z.number()), size: z.array(z.number()) }).describe("Millimetres."),
    triangles: z.number(),
    parts: z.number(),
    simplified: z.boolean(),
    mounting: Mounting.nullable(),
    suggested: Suggested.nullable().describe("Mounting read off the geometry: where the opening is, the ceiling the neck top meets and the neck width. A suggestion; set the mounting to use it."),
    created_at: z.string(),
    approved_at: z.string().nullable(),
  })
  .meta({ id: "CadModel" });
const ModelId = z.object({ id: z.string().max(40) });
const NoModel = { status: 404, code: "NOT_FOUND", when: "No such model." };

const Change = z.object({ op: z.enum(["add", "remove", "replace"]), path: z.string(), old: z.unknown().optional(), new: z.unknown().optional() });
const Chart = z.object({ file: z.string(), shape: z.string().nullable(), diameters: z.array(z.number()), sizes: z.number(), closures: z.array(z.string()) });

export const CATALOGUE = {
  importCharts: route({
    id: "importTubeCharts",
    method: "POST",
    path: "/v1/manage/catalogue/tube/import",
    audience: "manage",
    tags,
    auth: "session",
    role: "operator",
    summary: "Import Arapoush size charts into the tube catalogue",
    description:
      "Reads one or more size charts (.xlsx, one cross-section per file) and applies them to the current draft of `product.tube.catalogue`: sizes and volumes per diameter, which closures fit, and the colour families each closure comes in. Closures are matched by id, Persian name or `aliases`; unknown ones are added with a warning. Without `apply` it only previews (the changes against the draft). With `apply` it saves a new draft revision, which is published the normal way.",
    body: ImportBody,
    requestExample: { files: [{ name: "round.xlsx", data: "UEsDBBQABgAIAAAAIQ…" }], keep_missing: true, apply: false },
    responses: {
      200: {
        description: "Preview (or saved draft) with what the charts change.",
        schema: z.object({
          charts: z.array(Chart),
          warnings: z.array(z.string()).describe("Things to check: unknown wording, kept diameters, likely typos in the chart."),
          added: z.array(z.string()).describe("Ids of closures the charts introduced."),
          changes: z.array(Change).describe("Changes against the current draft."),
          base_revision_id: z.string().nullable().describe("The draft this preview was computed against."),
          revision: z.object({ id: z.string(), number: z.number() }).nullable().describe("The saved draft (apply only)."),
        }),
        example: {
          charts: [{ file: "round.xlsx", shape: "circular", diameters: [19, 25, 30, 35, 40, 50], sizes: 46, closures: ["اسکرو", "فیلیپ تاپ پیچی"] }],
          warnings: ["round.xlsx: circular Ø60 is not in the chart and was kept"],
          added: [],
          changes: [{ op: "replace", path: "/shapes[id=circular]/sizes/50[2]/status", old: "estimate", new: "chart" }],
          base_revision_id: "rev_01JD…",
          revision: null,
        },
      },
    },
    errors: [
      { status: 400, code: "NO_CHART", when: "None of the files could be read as a size chart (`warnings` says why)." },
      { status: 400, code: "VALIDATION_FAILED", when: "The result does not match the catalogue schema (`issues`)." },
      { status: 412, code: "CONFLICT_BASE_REVISION", when: "With apply: the draft changed since the preview; preview again." },
    ],
    audit: ["content.revision.create"],
    source: S,
  }),
  uploadModel: route({
    id: "uploadClosureModel",
    method: "POST",
    path: "/v1/manage/catalogue/tube/models",
    audience: "manage",
    tags,
    auth: "session",
    role: "operator",
    summary: "Upload factory CAD (STEP/STP or GLB) for a closure",
    description:
      "Converts the file to an optimized GLB in millimetres (OpenCascade for STEP, glTF Transform for both) in a worker, stores it and returns the model for review with a mounting suggested from the geometry. Nothing reaches the website until an operator sets the mounting and approves it. With `shape` and `diameter` the model is used only at that diameter. Limits: 25 MB, 2,000,000 triangles before simplification, 90 s.",
    body: z.strictObject({
      closure: z.string().min(1).max(40).describe("Catalogue closure id."),
      shape: z.string().min(1).max(40).optional().describe("Catalogue shape id; with `diameter`, the model is used only there."),
      diameter: z.number().int().min(5).max(120).optional().describe("Tube diameter in mm."),
      name: z.string().min(1).max(200),
      data: z.string().max(35_000_000).describe("The file, base64."),
      unit: z.enum(["mm", "m"]).default("m").describe("GLB only: what one unit in the file means (glTF default: metres). STEP carries its own units."),
    }),
    responses: { 201: { description: "Converted; needs review.", schema: CadModel } },
    errors: [
      { status: 400, code: "CAD_REJECTED", when: "Not STEP/GLB, unreadable, empty, too large, too many triangles or too slow (`detail` says which)." },
      { status: 400, code: "VALIDATION_FAILED", when: "`shape` and `diameter` must come together, and the shape must offer that diameter." },
      { status: 404, code: "NOT_FOUND", when: "No closure with that id in the catalogue draft." },
    ],
    audit: ["cad.uploaded", "cad.rejected"],
    source: S,
  }),
  listModels: route({
    id: "listClosureModels",
    method: "GET",
    path: "/v1/manage/catalogue/tube/models",
    audience: "manage",
    tags,
    auth: "session",
    role: "viewer",
    summary: "Closure models, newest first",
    query: z.object({ closure: z.string().max(40).optional() }),
    responses: { 200: { description: "Models.", schema: z.array(CadModel) } },
    source: S,
  }),
  mountModel: route({
    id: "setClosureModelMounting",
    method: "PUT",
    path: "/v1/manage/catalogue/tube/models/:id/mounting",
    audience: "manage",
    tags,
    auth: "session",
    role: "operator",
    summary: "Set how the model sits on the tube neck",
    description: "Axis, anchor point and neck diameter, read off the drawing or the preview. Required before approval; changing it on an approved model sends it back to review.",
    params: ModelId,
    body: Mounting,
    responses: { 200: { description: "Updated.", schema: CadModel } },
    errors: [NoModel],
    audit: ["cad.mounting"],
    source: S,
  }),
  approveModel: route({
    id: "approveClosureModel",
    method: "POST",
    path: "/v1/manage/catalogue/tube/models/:id/approve",
    audience: "manage",
    tags,
    auth: "session",
    role: "operator",
    summary: "Use the model for its closure (saves a catalogue draft)",
    description:
      "Writes the model (GLB, mounting, size) on the closure in the catalogue draft: `models3d[shape][diameter]` for a per-diameter model, otherwise `model3d`. The previously approved model for the same place is archived. The website shows it after the draft is published; the parametric shape stays as the fallback.",
    params: ModelId,
    body: z.strictObject({ base_revision_id: z.string().max(40).nullable().describe("The catalogue draft you are looking at.") }),
    responses: { 200: { description: "Approved; draft saved.", schema: z.object({ model: CadModel, revision: z.object({ id: z.string(), number: z.number() }) }) } },
    errors: [
      NoModel,
      { status: 400, code: "MOUNTING_REQUIRED", when: "Set the mounting first: a model is never placed by guess." },
      { status: 412, code: "CONFLICT_BASE_REVISION", when: "The catalogue draft changed; reload." },
    ],
    audit: ["cad.approved", "content.revision.create"],
    source: S,
  }),
} as const;
