import { z } from "zod";
import { Iso, IsoOrNull, Ok, route } from "../openapi/contract.ts";

/** A rendered image uploaded with POST /v1/render/jobs/{id}/assets. */
export const Shot = z.object({ asset: z.string().regex(/^ast_[0-9A-Z]{26}$/), width: z.number().int().positive(), height: z.number().int().positive() });
export const RenderResult = z.strictObject({
  sizes: z.array(Shot.extend({ id: z.string(), base: z.number(), mouth: z.number(), left: z.number(), right: z.number() }).describe("Per size: the image and its dimension marks (pixels).")),
  caps: z.array(Shot.extend({ id: z.string() })),
  uses: Shot.optional(),
  posters: z.partialRecord(z.enum(["wide-ltr", "tall-ltr", "wide-rtl", "tall-rtl"]), Shot).optional(),
});
const Input = z.object({ sizes: z.array(z.object({ id: z.string(), d: z.number(), h: z.number() })), caps: z.array(z.string()), defaultSize: z.string(), renderPxPerMm: z.number() });
const IdParam = z.object({ id: z.string().max(40) });
const JobState = { status: 409, code: "JOB_STATE", when: "The job is not running (finished, failed or superseded)." };
const NoJob = { status: 404, code: "NOT_FOUND", when: "No such job." };

const S = "render/routes.ts";
const tags = ["Render"];
export const RENDER = {
  queue: route({
    id: "queueRender",
    method: "POST",
    path: "/v1/manage/render",
    audience: "manage",
    tags: ["Content"],
    summary: "Render the effervescent page's 3D images again",
    description: "Queues a job for the current draft; older pending jobs are superseded. Jobs are also queued automatically when sizes or caps change.",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    responses: { 200: { description: "Queued.", schema: z.object({ id: z.string() }) } },
    errors: [{ status: 400, code: "NO_DRAFT", when: "The entry has no draft." }],
    audit: ["render.queued"],
  }),
  jobs: route({
    id: "listRenderJobs",
    method: "GET",
    path: "/v1/manage/render/jobs",
    audience: "manage",
    tags: ["Content"],
    summary: "The newest 30 render jobs",
    auth: "session",
    role: "viewer",
    source: S,
    responses: {
      200: {
        description: "Jobs, newest first.",
        schema: z.array(z.object({ id: z.string(), status: z.enum(["pending", "running", "done", "failed", "superseded"]), attempts: z.number(), created_at: Iso, claimed_at: IsoOrNull, finished_at: IsoOrNull, error: z.string().nullable(), revision_id: z.string().nullable(), revision: z.number().nullable(), sizes: z.number() })),
      },
    },
  }),
  claim: route({
    id: "claimRenderJob",
    method: "POST",
    path: "/v1/render/claim",
    audience: "render",
    tags,
    summary: "Claim the oldest pending job (or one whose renderer died)",
    description: "A running job whose renderer has not finished in 15 minutes can be claimed again. Each claim counts an attempt; three failed attempts leave the job failed.",
    auth: "render",
    source: S,
    responses: {
      200: { description: "A job to render.", schema: z.object({ id: z.string(), input: Input, site: z.string().describe("Website origin to open with ?webgl&render.") }) },
      204: { description: "Nothing to do." },
    },
    audit: ["render.started"],
  }),
  asset: route({
    id: "uploadRenderAsset",
    method: "POST",
    path: "/v1/render/jobs/:id/assets",
    audience: "render",
    tags,
    summary: "Upload one rendered image (PNG or WebP bytes)",
    auth: "render",
    source: S,
    params: IdParam,
    body: z.string().meta({ format: "binary" }),
    bodyType: "application/octet-stream",
    headers: [{ name: "X-Filename", description: "File name, for the media library." }],
    responses: { 200: { description: "Stored through the media pipeline.", schema: z.object({ asset: z.string(), width: z.number().nullable(), height: z.number().nullable(), url: z.string() }) } },
    errors: [NoJob, JobState, { status: 400, code: "NO_FILE", when: "Body is not application/octet-stream." }, { status: 400, code: "MEDIA_REJECTED", when: "Not a PNG/WebP or unreadable." }],
    audit: ["media.upload"],
  }),
  fail: route({
    id: "failRenderJob",
    method: "POST",
    path: "/v1/render/jobs/:id/fail",
    audience: "render",
    tags,
    summary: "Report a failed attempt",
    auth: "render",
    source: S,
    params: IdParam,
    body: z.strictObject({ error: z.string().max(2000) }),
    responses: { 200: { description: "Recorded; retried until three attempts.", schema: Ok } },
    errors: [NoJob, JobState],
    audit: ["render.failed"],
  }),
  complete: route({
    id: "completeRenderJob",
    method: "POST",
    path: "/v1/render/jobs/:id/complete",
    audience: "render",
    tags,
    summary: "Finish: write the images and marks into a new draft revision",
    description: "Only the rendered fields change (sizes[*].render, caps.variants[*].image, images.uses, images.posters); everything else in the draft stays.",
    auth: "render",
    source: S,
    params: IdParam,
    body: RenderResult,
    responses: { 200: { description: "The new draft revision.", schema: z.object({ revision: z.string(), number: z.number(), changes: z.number() }) } },
    errors: [NoJob, JobState, { status: 403, code: "UNKNOWN_ASSET", when: "An asset was not uploaded by the renderer." }],
    audit: ["render.completed"],
  }),
};
