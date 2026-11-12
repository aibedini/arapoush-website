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
} as const;
