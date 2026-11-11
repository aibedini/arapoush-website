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
    redirect("/");
  }
  const token = url.searchParams.get("token") ?? "";
  const path = url.searchParams.get("path") ?? "/";
  // Same-site paths only; never an open redirect.
  if (!/^[\w.-]+\.[\w.-]+\.[\w-]+$/.test(token) || token.length > 2000 || !/^\/(?!\/)[\w\-/]*$/.test(path)) return new Response("Bad preview link", { status: 400 });
  draft.enable();
  // SameSite=None over https so the preview also works inside the console frame (another site).
  const https = url.protocol === "https:";
  jar.set("opex_preview", token, { httpOnly: true, secure: https, sameSite: https ? "none" : "lax", path: "/", maxAge: 30 * 60 });
  redirect(path);
}
