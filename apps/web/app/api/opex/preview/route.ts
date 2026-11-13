import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Opens a draft preview from the OPEX console (docs/opex/OPEX-PLAN.md §10.3). The token is short-lived
 * and signed by OPEX, which checks it again on every preview fetch; this route only stores it in an
 * http-only cookie, turns on draft mode and goes to the page.
 * `?exit=1` leaves preview.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const draft = await draftMode();
  if (url.searchParams.get("exit")) {
    draft.disable();
    jar.delete("opex_preview");
    jar.delete("opex_edit");
    redirect("/");
  }
  const token = url.searchParams.get("token") ?? "";
  const path = url.searchParams.get("path") ?? "/";
  // Same-site paths only; never an open redirect.
  if (!/^[\w.-]+\.[\w.-]+\.[\w-]+$/.test(token) || token.length > 2000 || !/^\/(?!\/)[\w\-/]*$/.test(path)) return new Response("Bad preview link", { status: 400 });
  // S2: OPEX checks the signature before anything is switched on, so a made-up token cannot put a
  // visitor into (uncached) draft mode.
  const verdict = await verify(token);
  if (!verdict.ok) return new Response("Preview link expired", { status: 401 });
  draft.enable();
  // SameSite=None over https so the preview also works inside the console frame (another site).
  const https = url.protocol === "https:";
  jar.set("opex_preview", token, { httpOnly: true, secure: https, sameSite: https ? "none" : "lax", path: "/", maxAge: 30 * 60 });
  // Visual editor (P12): the page loads its in-place editing bridge.
  if (url.searchParams.get("edit") === "1" && !verdict.partner) jar.set("opex_edit", "1", { httpOnly: true, secure: https, sameSite: https ? "none" : "lax", path: "/", maxAge: 30 * 60 });
  else jar.delete("opex_edit");
  // Optional page query (e.g. the configurator on one closure); same characters OPEX allows.
  const q = url.searchParams.get("q") ?? "";
  redirect(/^[\w=&.-]{1,200}$/.test(q) ? `${path}?${q}` : path);
}

/** Asks OPEX whether the token is valid (and whether it is a partner link, which never edits). */
async function verify(token: string): Promise<{ ok: boolean; partner: boolean }> {
  const base = process.env.OPEX_DELIVERY_URL?.replace(/\/$/, "");
  const bearer = process.env.OPEX_DELIVERY_TOKEN;
  if (!base || !bearer) return { ok: false, partner: false };
  try {
    const res = await fetch(`${base}/v1/delivery/preview`, { cache: "no-store", headers: { authorization: `Bearer ${bearer}`, "opex-preview": token }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, partner: false };
    const body = (await res.json()) as { partner?: boolean };
    return { ok: true, partner: body.partner === true };
  } catch {
    return { ok: false, partner: false };
  }
}
