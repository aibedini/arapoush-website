import { postToOpex } from "@/lib/blog";
import { formBack, visitorIp } from "@/lib/blogForms";

/**
 * A visitor's comment (plain HTML form, no JavaScript). Forwarded to OPEX with the visitor's IP; the
 * answer is a 303 back to the article with an anchor the page shows a message for (CSS :target).
 * A filled honeypot gets the "pending" answer and nothing is stored.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const back = formBack(form);
  if (!form || !back) return new Response("Bad request", { status: 400 });
  const go = (anchor: string) => new Response(null, { status: 303, headers: { location: `${back}#${anchor}` } });
  if (String(form.get("website") ?? "")) return go("comment-pending");
  const field = (k: string, max: number) => String(form.get(k) ?? "").slice(0, max);
  const parentId = field("parentId", 40);
  const r = await postToOpex(
    "/v1/delivery/blog/comments",
    { postId: field("postId", 40), locale: field("locale", 2), name: field("name", 80), email: field("email", 200), body: field("body", 2000), ...(parentId ? { parentId } : {}) },
    visitorIp(req),
  );
  const status = (r.body as { status?: string } | null)?.status;
  return go(r.status === 200 && (status === "approved" || status === "pending") ? `comment-${status}` : "comment-error");
}
