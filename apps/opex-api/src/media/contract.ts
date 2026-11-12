import { z } from "zod";
import { Iso, route } from "../openapi/contract.ts";

export const AssetSchema = z.object({ id: z.string(), url: z.string(), mime: z.string(), bytes: z.number(), width: z.number().nullable(), height: z.number().nullable(), status: z.string(), scan: z.string() }).meta({ id: "Asset" });
const File = z.object({ file: z.string().regex(/^ast_[0-9A-Z]{26}\.\w+$/).describe("ast_….webp | .svg | .pdf | .ai | .glb (3D models)") });
const Bytes = { description: "The file.", contentType: "application/octet-stream" };

const S = "media/routes.ts";
const tags = ["Media"];
export const MEDIA = {
  upload: route({
    id: "uploadMedia",
    method: "POST",
    path: "/v1/manage/media",
    audience: "manage",
    tags,
    summary: "Upload a file to the media library",
    description: "One file as multipart/form-data (max 25 MB). Raster images are re-encoded to WebP and stripped of metadata; SVG and PDF are checked for active content; with ClamAV configured every file is scanned. Identical files are de-duplicated.",
    auth: "session",
    role: "operator",
    source: S,
    body: z.object({ file: z.string().meta({ format: "binary" }) }),
    bodyType: "multipart/form-data",
    rateLimit: "60 uploads per hour per IP",
    responses: { 200: { description: "Stored.", schema: AssetSchema } },
    errors: [
      { status: 400, code: "NO_FILE", when: "No file part." },
      { status: 400, code: "TOO_LARGE", when: "Larger than 25 MB." },
      { status: 400, code: "MEDIA_REJECTED", when: "Type not allowed, active content, unreadable, malware, or the scanner is down (`detail` says which)." },
    ],
    audit: ["media.upload", "media.rejected"],
  }),
  list: route({
    id: "listMedia",
    method: "GET",
    path: "/v1/manage/media",
    audience: "manage",
    tags,
    summary: "Media library (60 per page, newest first)",
    auth: "session",
    role: "viewer",
    source: S,
    query: z.object({ q: z.string().max(80).optional().describe("Search in original file names."), cursor: z.string().optional().describe("The last id of the previous page.") }),
    responses: {
      200: {
        description: "Assets.",
        schema: z.array(z.object({ id: z.string(), mime: z.string(), bytes: z.number(), width: z.number().nullable(), height: z.number().nullable(), original_name: z.string(), status: z.string(), scan: z.string().nullable(), public: z.boolean(), created_at: Iso, uploaded_by: z.string().nullable() })),
      },
    },
  }),
  raw: route({
    id: "getMediaRaw",
    method: "GET",
    path: "/v1/manage/media/:file/raw",
    audience: "manage",
    tags,
    summary: "Any asset, including private and unpublished ones (console only)",
    auth: "session",
    role: "viewer",
    source: S,
    params: File,
    responses: { 200: { ...Bytes, headers: { "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox" } } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such asset." }],
  }),
  public: route({
    id: "getMedia",
    method: "GET",
    path: "/media/:file",
    audience: "ops",
    tags: ["Public files"],
    summary: "A published media file",
    description: "Public once the asset is used in published content and clean. Immutable: an id never changes content.",
    auth: "none",
    source: S,
    params: File,
    rateLimit: "3000 per minute per IP",
    responses: { 200: { ...Bytes, headers: { "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown, private or not clean." }],
  }),
};
