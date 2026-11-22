import { z } from "zod";
import { LOCALES } from "@arapoush/schema";
import { route } from "../openapi/contract.ts";

const S = "translate/routes.ts";
const tags = ["Translation"];
const manage = { audience: "manage" as const, tags, auth: "session" as const, source: S, role: "operator" as const };

const Lang = z.enum(LOCALES);
const PerLocale = z.record(z.string(), z.number().int());

/** What every translate call takes: the source, one or more targets, and what to fill. */
const Job = {
  from: Lang.describe("The language to translate from (its text must exist)."),
  to: z.array(Lang).min(1).max(LOCALES.length).describe("Target languages (several at once)."),
  mode: z.enum(["missing", "all"]).default("missing").describe("`missing`: fill only empty values of each target. `all`: translate every value again, replacing what is there."),
  note: z.string().max(500).optional().describe("Extra instructions for the translator (tone, terms to keep)."),
  dryRun: z.boolean().default(false).describe("Count what would be translated without calling the AI or saving."),
};
const Refusals = [
  { status: 400, code: "SAME_LANGUAGE", when: "A target is the source language." },
  { status: 503, code: "AI_OFF", when: "ANTHROPIC_API_KEY is not set on the server." },
  { status: 502, code: "AI_FAILED", when: "The AI service failed or declined; try again (nothing was saved)." },
];
const Result = z.object({
  segments: z.number().int().describe("Values sent for translation (summed over targets)."),
  written: z.number().int().describe("Values written into the draft."),
  perLocale: PerLocale.describe("Values written per target language."),
});

export const TRANSLATE = {
  overview: route({
    ...manage,
    id: "translateOverview",
    method: "GET",
    path: "/v1/manage/translate",
    summary: "Languages, whether AI translation is on, and how complete each page, post and blog list is per language",
    role: "viewer",
    responses: {
      200: {
        description: "Coverage counts the values that have text in at least one language.",
        schema: z.object({
          ai: z.boolean(),
          locales: z.array(z.object({ code: Lang, name: z.string(), native: z.string(), dir: z.enum(["rtl", "ltr"]) })),
          entries: z.array(z.object({ type: z.string(), label: z.string(), total: z.number().int(), filled: PerLocale, unpublished: z.boolean() })),
          posts: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), locales: z.array(Lang).describe("Languages with a title and a body.") })),
          taxonomy: z.object({ total: z.number().int(), filled: PerLocale }),
        }),
      },
    },
  }),
  entry: route({
    ...manage,
    id: "translateEntry",
    method: "POST",
    path: "/v1/manage/translate/entries/:type",
    summary: "AI-translate a page, global or one of its sections into several languages; saved as a new draft",
    description:
      "Walks the entry's schema and translates every localized text (and image alt text) under `scope`. Locked fields are left alone. Edits made while the AI works are kept: a value is only written when its source text did not change meanwhile. Nothing is published.",
    params: z.object({ type: z.string().max(80) }),
    body: z.strictObject({ ...Job, scope: z.string().startsWith("/").max(300).optional().describe("Only values under this field path, e.g. /sections[id=hero] or /hero.") }),
    rateLimit: "30 per minute",
    responses: { 200: { description: "What was translated; `revision` is null when nothing changed (or on a dry run).", schema: Result.extend({ revision: z.object({ id: z.string(), number: z.number() }).nullable() }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown content type or entry." }, ...Refusals],
    audit: ["content.translate", "content.revision.create"],
  }),
  post: route({
    ...manage,
    id: "translatePost",
    method: "POST",
    path: "/v1/manage/translate/blog/:id",
    summary: "AI-translate a blog post into several languages; saved as a new draft revision",
    description:
      "A missing target gets a whole translation (title, slug, body, takeaways, FAQ, SEO). With `missing`, an existing target only gets its empty parts. New translations are switched on in the draft when `enable` is true; the post still needs publishing.",
    params: z.object({ id: z.string().max(40) }),
    body: z.strictObject({ ...Job, enable: z.boolean().default(true).describe("Switch on languages this creates.") }),
    rateLimit: "30 per minute",
    responses: { 200: { description: "What was translated.", schema: Result.extend({ revisionId: z.string().nullable() }) } },
    errors: [
      { status: 404, code: "NOT_FOUND", when: "No such post, or it has no text in the source language." },
      { status: 403, code: "NOT_YOUR_POST", when: "Someone else's post and you lack blog.edit_others." },
      ...Refusals,
    ],
    audit: ["blog.post.translate"],
  }),
  taxonomy: route({
    ...manage,
    id: "translateBlogTaxonomy",
    method: "POST",
    path: "/v1/manage/translate/blog-taxonomy",
    summary: "AI-translate blog categories, tags and authors (names, descriptions, roles, bios)",
    description: "Category slugs that are missing in a target are made from the translated name when free.",
    body: z.strictObject(Job),
    rateLimit: "30 per minute",
    responses: { 200: { description: "What was translated.", schema: Result } },
    errors: Refusals,
    audit: ["blog.taxonomy.translate"],
  }),
};
