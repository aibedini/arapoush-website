import { postToOpex } from "@/lib/blog";
import { visitorIp } from "@/lib/blogForms";

/**
 * Confirm or cancel a subscription. The emailed link opens a page with a button that posts here, so a
 * mail scanner that follows links cannot confirm or cancel on the reader's behalf.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const locale = String(form?.get("locale") ?? "fa");
  const l = ["fa", "en", "tr"].includes(locale) ? locale : "fa";
  const token = String(form?.get("token") ?? "");
  const action = String(form?.get("action") ?? "");
  const done = (state: string) => new Response(null, { status: 303, headers: { location: `/${l}/blog/newsletter?done=${state}` } });
  if (!/^[\w-]{20,80}$/.test(token) || (action !== "confirm" && action !== "unsubscribe")) return done("invalid");
  const r = await postToOpex("/v1/delivery/blog/newsletter", { token, action }, visitorIp(req));
  const status = (r.body as { status?: string } | null)?.status;
  return done(r.status === 200 && status ? status : "invalid");
}
