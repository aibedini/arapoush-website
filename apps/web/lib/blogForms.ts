/** Shared by the blog's form routes (comments, newsletter). */

/** The visitor's address behind the reverse proxy (first X-Forwarded-For hop). */
export function visitorIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (xff || req.headers.get("x-real-ip") || "").slice(0, 64) || undefined;
}

/** Where to send the visitor back: only a journal page of this site (never an open redirect). */
export function formBack(form: FormData | null) {
  const back = String(form?.get("back") ?? "");
  return /^\/(fa|en|tr)\/blog(\/[^\s?#]*)?$/.test(back) && back.length < 400 ? back : null;
}
