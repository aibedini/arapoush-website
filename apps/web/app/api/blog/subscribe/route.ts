import { postToOpex } from "@/lib/blog";
import { formBack, visitorIp } from "@/lib/blogForms";

/** Newsletter sign-up form (no JavaScript): OPEX emails a confirmation link (double opt-in). */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const back = formBack(form);
  if (!form || !back) return new Response("Bad request", { status: 400 });
  const go = (anchor: string) => new Response(null, { status: 303, headers: { location: `${back}#${anchor}` } });
  if (String(form.get("website") ?? "")) return go("subscribed");
  const locale = String(form.get("locale") ?? "fa");
  const r = await postToOpex("/v1/delivery/blog/subscribe", { email: String(form.get("email") ?? "").slice(0, 200), locale: ["fa", "en", "tr"].includes(locale) ? locale : "fa" }, visitorIp(req));
  return go(r.status === 200 ? "subscribed" : "subscribe-error");
}
