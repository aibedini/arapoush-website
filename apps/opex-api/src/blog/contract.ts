import { z } from "zod";
import { BLOG_PRODUCTS, SLUG_RE, validSlug } from "@arapoush/schema";
import { Iso, IsoOrNull, Ok, route } from "../openapi/contract.ts";

const S = "blog/routes.ts";
const tags = ["Blog"];
const Text = (max: number) => z.string().max(max);
const LocaleKey = z.enum(["fa", "en", "tr"]);
const Loc = (max: number) => z.strictObject({ fa: Text(max).optional(), en: Text(max).optional(), tr: Text(max).optional() });
const Id = z.string().max(40);
const BlockId = z.string().regex(/^[\w-]{1,40}$/);
/** Site media or site images only; the console uploads through the media library (scanned). */
export const BlogImage = z.strictObject({
  src: z.string().regex(/^\/(images|media)\/[\w./-]+$/).max(300),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  alt: Text(300).optional(),
});
const Href = z.string().max(500).regex(/^(\/(?!\/)[^\s]*|https:\/\/[^\s]+|#[^\s]+)$/, "A site path (/fa/…) or an https:// link");
const Block = z.discriminatedUnion("kind", [
  z.strictObject({ id: BlockId, kind: z.literal("p"), text: Text(5000) }),
  z.strictObject({ id: BlockId, kind: z.literal("h"), level: z.union([z.literal(2), z.literal(3)]), text: Text(200) }),
  z.strictObject({ id: BlockId, kind: z.literal("list"), ordered: z.boolean(), items: z.array(Text(1000)).max(50) }),
  z.strictObject({ id: BlockId, kind: z.literal("image"), image: BlogImage, caption: Text(300).optional() }),
  z.strictObject({ id: BlockId, kind: z.literal("quote"), text: Text(2000), cite: Text(200).optional() }),
  z.strictObject({ id: BlockId, kind: z.literal("callout"), tone: z.enum(["info", "tip", "warn"]), title: Text(150).optional(), text: Text(2000) }),
  z.strictObject({ id: BlockId, kind: z.literal("table"), head: z.array(Text(200)).max(10), rows: z.array(z.array(Text(500)).max(10)).max(100), caption: Text(300).optional() }),
  z.strictObject({ id: BlockId, kind: z.literal("cta"), text: Text(300), button: Text(60), href: Href }),
]);
const Slug = z.string().max(100).refine((s) => s === "" || SLUG_RE.test(s), "Lowercase letters, digits and hyphens");
/** A post's slug: also not one of the blog's own paths (page, category, author, preview, feed). */
const PostSlug = z.string().max(100).refine((s) => s === "" || validSlug(s), "Letters, digits and hyphens; not page, category, author, preview or feed");
export const Translation = z.strictObject({
  enabled: z.boolean(),
  title: Text(200),
  slug: PostSlug,
  excerpt: Text(600),
  body: z.array(Block).max(400),
  keyTakeaways: z.array(Text(300)).max(10),
  faq: z.array(z.strictObject({ q: Text(300), a: Text(2000) })).max(20),
  sources: z.array(z.strictObject({ title: Text(300), url: z.string().url().max(500).regex(/^https:\/\//) })).max(30),
  seo: z.strictObject({
    title: Text(120).optional(),
    description: Text(320).optional(),
    keyphrase: Text(100).optional(),
    canonical: z.string().url().max(500).regex(/^https:\/\//).optional().or(z.literal("")),
    noindex: z.boolean().optional(),
    ogImage: BlogImage.nullable().optional(),
  }),
  keywords: z.array(Text(80)).max(15).optional(),
});
export const PostData = z.strictObject({
  categoryId: Id.nullable(),
  tagIds: z.array(Id).max(20),
  authorId: Id.nullable(),
  reviewerId: Id.nullable(),
  cover: BlogImage.nullable(),
  featured: z.boolean(),
  products: z.array(z.enum(BLOG_PRODUCTS)).max(4),
  relatedIds: z.array(Id).max(6),
  commentsOpen: z.boolean().optional(),
  notifySubscribers: z.boolean().optional(),
  translations: z.strictObject({ fa: Translation.optional(), en: Translation.optional(), tr: Translation.optional() }),
});

/** An image in answers: a site path with its pixel size and alt text. */
const ImageOut = z.object({ src: z.string(), width: z.number().int().optional(), height: z.number().int().optional(), alt: z.string().optional() }).nullable();
const Status = z.enum(["draft", "review", "scheduled", "published", "archived"]);
const PostSummary = z.object({
  id: z.string(),
  status: Status,
  titles: z.record(z.string(), z.string()).describe("Draft title per written locale."),
  live: z.array(z.string()).describe("Locales live on the site."),
  ready: z.array(z.string()).describe("Locales complete in the draft."),
  categoryId: z.string().nullable(),
  authorId: z.string().nullable(),
  cover: z.string().nullable(),
  featured: z.boolean(),
  unpublishedChanges: z.boolean(),
  createdBy: z.string().nullable(),
  mine: z.boolean(),
  updatedAt: Iso,
  publishedAt: IsoOrNull,
  scheduledAt: IsoOrNull,
});
const PostDetail = z.object({
  id: z.string(),
  status: Status,
  data: z.unknown().describe("The draft (PostData)."),
  draftRevisionId: z.string().nullable(),
  publishedRevisionId: z.string().nullable(),
  revision: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: Iso,
  updatedAt: Iso,
  firstPublishedAt: IsoOrNull,
  publishedAt: IsoOrNull,
  scheduledAt: IsoOrNull,
  slugs: z.array(z.object({ locale: z.string(), slug: z.string(), current: z.boolean() })),
  can: z.object({ edit: z.boolean(), publish: z.boolean(), delete: z.boolean() }),
});
const Category = z.object({ id: z.string(), name: z.record(z.string(), z.string()), slug: z.record(z.string(), z.string()), description: z.record(z.string(), z.string()), position: z.number().int(), posts: z.number().int() });
const Tag = z.object({ id: z.string(), name: z.record(z.string(), z.string()), slug: z.string(), posts: z.number().int() });
const Author = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.record(z.string(), z.string()),
  role: z.record(z.string(), z.string()),
  bio: z.record(z.string(), z.string()),
  expertise: z.array(z.string()),
  photo: ImageOut,
  sameAs: z.array(z.string()),
  principalId: z.string().nullable(),
  posts: z.number().int(),
});
export const CategoryBody = z.strictObject({ name: Loc(80), slug: z.strictObject({ fa: Slug.optional(), en: Slug.optional(), tr: Slug.optional() }), description: Loc(300).default({}), position: z.number().int().min(0).max(1000).default(0) });
export const TagBody = z.strictObject({ name: Loc(60), slug: Slug.refine((s) => s.length > 0, "Required") });
export const AuthorBody = z.strictObject({
  slug: Slug.refine((s) => s.length > 0, "Required"),
  name: Loc(120),
  role: Loc(120).default({}),
  bio: Loc(1500).default({}),
  expertise: z.array(Text(80)).max(12).default([]),
  photo: BlogImage.nullable().default(null),
  sameAs: z.array(z.string().url().max(300).regex(/^https:\/\//)).max(8).default([]),
  principalId: Id.nullable().default(null),
});

const NotFound = { status: 404, code: "NOT_FOUND", when: "No such post." };
const NotYours = { status: 403, code: "NOT_YOUR_POST", when: "The post was written by someone else and you lack blog.edit_others." };
const Params = z.object({ id: Id });
const manage = { audience: "manage" as const, tags, auth: "session" as const, source: S };

export const BLOG = {
  list: route({
    ...manage,
    id: "blogList",
    method: "GET",
    path: "/v1/manage/blog/posts",
    summary: "Blog posts (newest change first)",
    role: "viewer",
    query: z.object({ status: Status.optional(), q: z.string().max(100).optional(), mine: z.enum(["1"]).optional() }),
    responses: { 200: { description: "At most 500.", schema: z.array(PostSummary) } },
  }),
  create: route({
    ...manage,
    id: "blogCreate",
    method: "POST",
    path: "/v1/manage/blog/posts",
    summary: "Start a post (a Persian draft unless data is given)",
    role: "operator",
    body: z.strictObject({ data: PostData.optional() }),
    responses: { 200: { description: "Created.", schema: z.object({ id: z.string(), revisionId: z.string() }) } },
    audit: ["blog.post.create"],
  }),
  get: route({ ...manage, id: "blogGet", method: "GET", path: "/v1/manage/blog/posts/:id", summary: "One post: draft, state, slugs and what you may do", role: "viewer", params: Params, responses: { 200: { description: "The post.", schema: PostDetail } }, errors: [NotFound] }),
  save: route({
    ...manage,
    id: "blogSave",
    method: "PUT",
    path: "/v1/manage/blog/posts/:id",
    summary: "Save the draft (a new revision)",
    description: "Refused with 412 when the draft moved on since `baseRevisionId` (someone else saved).",
    role: "operator",
    params: Params,
    body: z.strictObject({ data: PostData, baseRevisionId: Id.nullable(), note: Text(200).optional() }),
    responses: { 200: { description: "Saved (or unchanged).", schema: z.object({ revisionId: z.string(), revision: z.number().int(), changed: z.boolean() }) } },
    errors: [NotFound, NotYours, { status: 412, code: "CONFLICT_BASE_REVISION", when: "The draft changed since you opened it." }, { status: 409, code: "SLUG_TAKEN", when: "Another post uses (or used) this slug in that language." }, { status: 409, code: "ARCHIVED", when: "The post is archived." }],
    audit: ["blog.post.save"],
  }),
  submit: route({
    ...manage,
    id: "blogSubmit",
    method: "POST",
    path: "/v1/manage/blog/posts/:id/submit",
    summary: "Send the draft for review",
    role: "operator",
    params: Params,
    responses: { 200: { description: "Now in review.", schema: Ok } },
    errors: [NotFound, NotYours, { status: 409, code: "WRONG_STATE", when: "Only drafts go to review." }],
    audit: ["blog.post.submit"],
  }),
  publish: route({
    ...manage,
    id: "blogPublish",
    method: "POST",
    path: "/v1/manage/blog/posts/:id/publish",
    summary: "Publish the draft now, or schedule it",
    description: "Every enabled, complete translation goes live with its slug; old slugs redirect (301). Referenced media must be scanned clean.",
    role: "operator",
    params: Params,
    body: z.strictObject({ at: Iso.optional().describe("Publish at this time instead of now.") }),
    responses: { 200: { description: "Published or scheduled.", schema: z.object({ status: Status, live: z.array(z.string()), scheduledAt: IsoOrNull }) } },
    errors: [NotFound, { status: 400, code: "NOTHING_LIVE", when: "No translation is enabled and complete (title, slug, body)." }, { status: 409, code: "SLUG_TAKEN", when: "Another post uses this slug." }, { status: 400, code: "MEDIA_NOT_CLEAN", when: "A referenced image is not scanned clean yet." }, { status: 409, code: "ARCHIVED", when: "The post is archived." }],
    audit: ["blog.post.publish", "blog.post.schedule"],
  }),
  unpublish: route({ ...manage, id: "blogUnpublish", method: "POST", path: "/v1/manage/blog/posts/:id/unpublish", summary: "Take the post off the site (it stays in OPEX as a draft)", role: "operator", params: Params, responses: { 200: { description: "Unpublished; its URLs answer 404.", schema: Ok } }, errors: [NotFound], audit: ["blog.post.unpublish"] }),
  archive: route({ ...manage, id: "blogArchive", method: "DELETE", path: "/v1/manage/blog/posts/:id", summary: "Archive a post (off the site, hidden from the list)", role: "operator", params: Params, responses: { 200: { description: "Archived. Revisions stay.", schema: Ok } }, errors: [NotFound], audit: ["blog.post.archive"] }),
  revisions: route({
    ...manage,
    id: "blogRevisions",
    method: "GET",
    path: "/v1/manage/blog/posts/:id/revisions",
    summary: "Revision history",
    role: "viewer",
    params: Params,
    responses: { 200: { description: "Newest first.", schema: z.array(z.object({ id: z.string(), number: z.number().int(), createdAt: Iso, author: z.string().nullable(), note: z.string().nullable(), published: z.boolean(), draft: z.boolean() })) } },
    errors: [NotFound],
  }),
  revision: route({
    ...manage,
    id: "blogRevision",
    method: "GET",
    path: "/v1/manage/blog/posts/:id/revisions/:rev",
    summary: "One revision's data",
    role: "viewer",
    params: z.object({ id: Id, rev: Id }),
    responses: { 200: { description: "The revision.", schema: z.object({ id: z.string(), number: z.number().int(), data: z.unknown(), createdAt: Iso }) } },
    errors: [NotFound],
  }),
  restore: route({
    ...manage,
    id: "blogRestore",
    method: "POST",
    path: "/v1/manage/blog/posts/:id/restore",
    summary: "Make an old revision the draft again",
    role: "operator",
    params: Params,
    body: z.strictObject({ revisionId: Id }),
    responses: { 200: { description: "A new draft revision with that content (publish it to go live).", schema: z.object({ revisionId: z.string(), revision: z.number().int() }) } },
    errors: [NotFound],
    audit: ["blog.post.restore"],
  }),
  preview: route({
    ...manage,
    id: "blogPreview",
    method: "POST",
    path: "/v1/manage/blog/posts/:id/preview",
    summary: "A 30-minute preview link to the article page with the draft",
    role: "viewer",
    params: Params,
    body: z.strictObject({ locale: LocaleKey }),
    responses: { 200: { description: "Open it in a new tab.", schema: z.object({ url: z.string(), expiresIn: z.number().int() }) } },
    errors: [NotFound],
    audit: ["blog.post.preview"],
  }),
  taxonomy: route({
    ...manage,
    id: "blogTaxonomy",
    method: "GET",
    path: "/v1/manage/blog/taxonomy",
    summary: "Categories, tags and authors",
    role: "viewer",
    responses: { 200: { description: "Everything the editor's pickers need.", schema: z.object({ categories: z.array(Category), tags: z.array(Tag), authors: z.array(Author) }) } },
  }),
  ...Object.fromEntries(
    (
      [
        ["Category", "categories", CategoryBody, "blog.manage"],
        ["Tag", "tags", TagBody, "blog.write"],
        ["Author", "authors", AuthorBody, "blog.manage"],
      ] as const
    ).flatMap(([name, path, body]) => [
      [
        `create${name}`,
        route({
          ...manage,
          id: `blogCreate${name}`,
          method: "POST",
          path: `/v1/manage/blog/${path}`,
          summary: `Create a ${name.toLowerCase()}`,
          role: "operator",
          body,
          responses: { 200: { description: "Created.", schema: z.object({ id: z.string() }) } },
          errors: [{ status: 409, code: "SLUG_TAKEN", when: "The slug is in use." }],
          audit: [`blog.${name.toLowerCase()}.create`],
        }),
      ],
      [
        `update${name}`,
        route({
          ...manage,
          id: `blogUpdate${name}`,
          method: "PUT",
          path: `/v1/manage/blog/${path}/:id`,
          summary: `Change a ${name.toLowerCase()}`,
          role: "operator",
          params: Params,
          body,
          responses: { 200: { description: "Saved; the site refreshes.", schema: Ok } },
          errors: [{ status: 404, code: "NOT_FOUND", when: "Not found." }, { status: 409, code: "SLUG_TAKEN", when: "The slug is in use." }],
          audit: [`blog.${name.toLowerCase()}.update`],
        }),
      ],
      [
        `delete${name}`,
        route({
          ...manage,
          id: `blogDelete${name}`,
          method: "DELETE",
          path: `/v1/manage/blog/${path}/:id`,
          summary: `Delete a ${name.toLowerCase()}`,
          role: "operator",
          params: Params,
          responses: { 200: { description: "Deleted.", schema: Ok } },
          errors: [{ status: 404, code: "NOT_FOUND", when: "Not found." }, { status: 409, code: "IN_USE", when: "Live posts still use it." }],
          audit: [`blog.${name.toLowerCase()}.delete`],
        }),
      ],
    ]),
  ) as Record<`${"create" | "update" | "delete"}${"Category" | "Tag" | "Author"}`, ReturnType<typeof route>>,
};

// ── Delivery (the website's server) ──
const delivery = { audience: "delivery" as const, tags: ["Delivery"], auth: "delivery" as const, source: "blog/delivery.ts" };
const Card = z.object({
  id: z.string(),
  locale: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  cover: ImageOut,
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
  author: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
  publishedAt: Iso,
  modifiedAt: Iso,
  readingMinutes: z.number().int(),
  featured: z.boolean(),
});
export const BLOG_DELIVERY = {
  list: route({
    ...delivery,
    id: "deliveryBlogList",
    method: "GET",
    path: "/v1/delivery/blog/posts",
    summary: "Live posts in one language, newest first",
    query: z.object({
      locale: LocaleKey,
      page: z.coerce.number().int().min(1).max(1000).default(1),
      per: z.coerce.number().int().min(1).max(50).default(12),
      category: z.string().max(100).optional().describe("Category slug in that language."),
      tag: z.string().max(100).optional(),
      author: z.string().max(100).optional(),
    }),
    responses: { 200: { description: "One page.", schema: z.object({ items: z.array(Card), total: z.number().int(), page: z.number().int(), pages: z.number().int() }) } },
  }),
  post: route({
    ...delivery,
    id: "deliveryBlogPost",
    method: "GET",
    path: "/v1/delivery/blog/post",
    summary: "One live post by language and slug (or where an old slug moved)",
    query: z.object({ locale: LocaleKey, slug: z.string().max(200) }),
    responses: { 200: { description: "The post, or `{ redirect }` with the current slug for an old one.", schema: z.object({ redirect: z.string().optional(), post: z.unknown().optional() }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No live post has (or had) this slug." }],
  }),
  index: route({
    ...delivery,
    id: "deliveryBlogIndex",
    method: "GET",
    path: "/v1/delivery/blog/index",
    summary: "Every live translation, compact (sitemap, feeds, llms.txt)",
    responses: { 200: { description: "Newest first.", schema: z.object({ posts: z.array(Card.extend({ alternates: z.record(z.string(), z.string()), noindex: z.boolean(), keyTakeaways: z.array(z.string()) })), categories: z.array(Category.omit({ posts: true })), authors: z.array(Author.omit({ posts: true, principalId: true })) }) } },
  }),
  preview: route({
    ...delivery,
    id: "deliveryBlogPreview",
    method: "GET",
    path: "/v1/delivery/blog/preview/:id",
    summary: "One post's draft, with a preview token for that post",
    params: Params,
    query: z.object({ locale: LocaleKey }),
    headers: [{ name: "opex-preview", required: true, description: "The preview token from the link." }],
    responses: { 200: { description: "The draft in the same shape as /post.", schema: z.object({ post: z.unknown() }) } },
    errors: [{ status: 401, code: "UNAUTHENTICATED", when: "Missing or expired preview token, or one for another post." }, { status: 404, code: "NOT_FOUND", when: "No such post or language." }],
  }),
};

// ── Comments, newsletter, search, settings, AI translation (docs/opex/BLOG-PLAN.md §8) ──
const CommentStatus = z.enum(["pending", "approved", "spam", "trash"]);
const Email = z.string().email().max(200);
export const CommentBody = z.strictObject({
  postId: Id,
  locale: LocaleKey,
  parentId: Id.optional(),
  name: z.string().trim().min(2).max(80),
  email: Email.optional().or(z.literal("")),
  body: z.string().trim().min(3).max(2000),
});
const ManageComment = z.object({
  id: z.string(),
  postId: z.string(),
  postTitle: z.string(),
  locale: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  email: z.string().nullable(),
  body: z.string(),
  status: CommentStatus,
  team: z.boolean(),
  createdAt: Iso,
});
const Subscriber = z.object({ id: z.string(), email: z.string(), locale: z.string(), status: z.enum(["pending", "confirmed", "unsubscribed"]), createdAt: Iso, confirmedAt: IsoOrNull });
const Translated = z.object({
  title: z.string(),
  excerpt: z.string(),
  body: z.array(z.unknown()),
  keyTakeaways: z.array(z.string()),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  seo: z.object({ title: z.string().optional(), description: z.string().optional(), keyphrase: z.string().optional() }),
  keywords: z.array(z.string()),
});
export const BLOG_EXTRA = {
  comments: route({
    ...manage,
    id: "blogComments",
    method: "GET",
    path: "/v1/manage/blog/comments",
    summary: "Comments to moderate (newest first)",
    role: "operator",
    query: z.object({ status: CommentStatus.optional(), post: Id.optional() }),
    responses: { 200: { description: "At most 300; emails decrypted for moderators.", schema: z.object({ items: z.array(ManageComment), pending: z.number().int() }) } },
  }),
  moderate: route({
    ...manage,
    id: "blogModerateComment",
    method: "POST",
    path: "/v1/manage/blog/comments/:id/moderate",
    summary: "Approve, mark as spam or move a comment to the trash",
    role: "operator",
    params: Params,
    body: z.strictObject({ status: CommentStatus }),
    responses: { 200: { description: "Changed; the article refreshes.", schema: Ok } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such comment." }],
    audit: ["blog.comment.moderate"],
  }),
  reply: route({
    ...manage,
    id: "blogReplyComment",
    method: "POST",
    path: "/v1/manage/blog/comments/:id/reply",
    summary: "Answer a comment as the Arapoush team (published at once)",
    role: "operator",
    params: Params,
    body: z.strictObject({ body: z.string().trim().min(2).max(2000) }),
    responses: { 200: { description: "The reply.", schema: z.object({ id: z.string() }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such comment." }],
    audit: ["blog.comment.reply"],
  }),
  deleteComment: route({ ...manage, id: "blogDeleteComment", method: "DELETE", path: "/v1/manage/blog/comments/:id", summary: "Delete a comment for good (with its replies)", role: "operator", params: Params, responses: { 200: { description: "Deleted.", schema: Ok } }, errors: [{ status: 404, code: "NOT_FOUND", when: "No such comment." }], audit: ["blog.comment.delete"] }),
  subscribers: route({
    ...manage,
    id: "blogSubscribers",
    method: "GET",
    path: "/v1/manage/blog/subscribers",
    summary: "Newsletter subscribers",
    role: "super_admin",
    responses: { 200: { description: "Newest first; emails decrypted.", schema: z.object({ items: z.array(Subscriber), confirmed: z.number().int() }) } },
  }),
  deleteSubscriber: route({ ...manage, id: "blogDeleteSubscriber", method: "DELETE", path: "/v1/manage/blog/subscribers/:id", summary: "Remove a subscriber for good (privacy request)", role: "super_admin", params: Params, responses: { 200: { description: "Removed.", schema: Ok } }, errors: [{ status: 404, code: "NOT_FOUND", when: "Not found." }], audit: ["blog.subscriber.delete"] }),
  settings: route({
    ...manage,
    id: "blogSettings",
    method: "GET",
    path: "/v1/manage/blog/settings",
    summary: "Blog switches (whole journal and each part) and comment rules",
    role: "viewer",
    responses: { 200: { description: "Settings, and which server features are configured.", schema: z.object({ settings: z.record(z.string(), z.unknown()), env: z.object({ mail: z.boolean(), ai: z.boolean() }) }) } },
  }),
  saveSettings: route({
    ...manage,
    id: "blogSaveSettings",
    method: "PUT",
    path: "/v1/manage/blog/settings",
    summary: "Change the blog switches",
    role: "operator",
    body: z.record(z.string(), z.unknown()).describe("BlogSettings (settings/contract.ts)."),
    responses: { 200: { description: "Saved; the site refreshes.", schema: Ok } },
    audit: ["blog.settings.update"],
  }),
  translate: route({
    ...manage,
    id: "blogTranslate",
    method: "POST",
    path: "/v1/manage/blog/posts/:id/translate",
    summary: "AI draft of one translation from another (Claude), not saved",
    description: "Needs ANTHROPIC_API_KEY on the server. The editor reviews the draft and saves it like any other edit.",
    role: "operator",
    params: Params,
    body: z.strictObject({ from: LocaleKey, to: LocaleKey }),
    rateLimit: "10 per minute",
    responses: { 200: { description: "The translated fields.", schema: Translated } },
    errors: [
      { status: 404, code: "NOT_FOUND", when: "No such post or source translation." },
      { status: 403, code: "NOT_YOUR_POST", when: "Someone else's post and you lack blog.edit_others." },
      { status: 503, code: "AI_OFF", when: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 502, code: "AI_FAILED", when: "The AI service failed or declined; try again." },
    ],
    audit: ["blog.post.translate"],
  }),
};

export const BLOG_COMMUNITY = {
  comment: route({
    ...delivery,
    id: "deliveryBlogComment",
    method: "POST",
    path: "/v1/delivery/blog/comments",
    summary: "A visitor's comment (the website forwards it with the visitor's IP)",
    headers: [{ name: "x-end-user-ip", description: "The visitor's IP (rate limits)." }],
    body: CommentBody,
    rateLimit: "5 per minute per visitor",
    responses: { 200: { description: "Stored; `status` says whether it is visible now.", schema: z.object({ status: z.enum(["pending", "approved"]) }) } },
    errors: [
      { status: 404, code: "NOT_FOUND", when: "No live post in that language." },
      { status: 403, code: "COMMENTS_CLOSED", when: "Comments are off for the blog or closed on this post." },
      { status: 400, code: "TOO_MANY_LINKS", when: "More links than the blog allows." },
      { status: 400, code: "EMAIL_REQUIRED", when: "The blog asks for an email." },
      { status: 429, code: "TOO_MANY_COMMENTS", when: "Too many comments from this address lately." },
    ],
  }),
  subscribe: route({
    ...delivery,
    id: "deliveryBlogSubscribe",
    method: "POST",
    path: "/v1/delivery/blog/subscribe",
    summary: "Newsletter sign-up: sends a confirmation email (double opt-in)",
    body: z.strictObject({ email: Email, locale: LocaleKey }),
    rateLimit: "5 per minute per visitor",
    responses: { 200: { description: "Always the same answer (no address enumeration).", schema: Ok } },
    errors: [{ status: 403, code: "NEWSLETTER_OFF", when: "The newsletter is switched off." }],
  }),
  newsletter: route({
    ...delivery,
    id: "deliveryBlogNewsletter",
    method: "POST",
    path: "/v1/delivery/blog/newsletter",
    summary: "Confirm or cancel a subscription with the token from an email",
    body: z.strictObject({ token: z.string().regex(/^[\w-]{20,80}$/), action: z.enum(["confirm", "unsubscribe"]) }),
    responses: { 200: { description: "Done.", schema: z.object({ ok: z.literal(true), status: z.enum(["confirmed", "unsubscribed"]) }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown or old token." }],
  }),
  search: route({
    ...delivery,
    id: "deliveryBlogSearch",
    method: "GET",
    path: "/v1/delivery/blog/search",
    summary: "Search live posts in one language",
    query: z.object({ locale: LocaleKey, q: z.string().trim().min(2).max(100) }),
    responses: { 200: { description: "Best matches first (at most 30).", schema: z.object({ items: z.array(Card) }) } },
  }),
};
