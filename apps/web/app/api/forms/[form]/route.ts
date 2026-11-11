import { ensureContent, opexEnabled } from "@/lib/content";
import { getForm } from "@/lib/content/forms";

/**
 * Website forms → OPEX (docs/opex/OPEX-PLAN.md §10.4). The browser posts here; this server adds the
 * visitor's IP and forwards with the delivery token, so OPEX credentials never reach the browser.
 *
 * Spam controls here: a honeypot field and a minimum fill time. Both answer a bot with a fake success
 * and store nothing. OPEX adds validation, a per-IP limit and optional Turnstile.
 * 404 means "OPEX is not set up": the form falls back to the visitor's email app.
 */
export const dynamic = "force-dynamic";

const MIN_FILL_MS = 2500;

function visitorIp(req: Request) {
  // Behind the reverse proxy (Caddy) the client address is the first X-Forwarded-For hop.
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (xff || req.headers.get("x-real-ip") || "").slice(0, 64) || undefined;
}

export async function POST(req: Request, ctx: { params: Promise<{ form: string }> }) {
  const { form } = await ctx.params;
  if (!opexEnabled() || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(form)) return Response.json({ fallback: true }, { status: 404 });
  await ensureContent();
  if (!getForm(form)) return Response.json({ fallback: true }, { status: 404 });
  // Room for uploads (files travel base64 in the JSON body; OPEX checks each one).
  if (Number(req.headers.get("content-length") ?? 0) > 16_000_000) return Response.json({ error: "too_large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > 16_000_000) return Response.json({ error: "too_large" }, { status: 413 });
  let body: { website?: string; shownAt?: number; [k: string]: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const { website, shownAt, ...inquiry } = body;
  if (website || typeof shownAt !== "number" || Date.now() - shownAt < MIN_FILL_MS || Date.now() - shownAt > 86_400_000) return Response.json({ ok: true }, { status: 202 });

  const ip = visitorIp(req);
  try {
    const r = await fetch(`${process.env.OPEX_DELIVERY_URL!.replace(/\/$/, "")}/v1/delivery/forms/${form}`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPEX_DELIVERY_TOKEN}`, "content-type": "application/json", ...(ip ? { "x-end-user-ip": ip } : {}) },
      body: JSON.stringify(inquiry),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (r.status === 202) return Response.json({ ok: true }, { status: 202 });
    if (r.ok) return Response.json({ ok: true, number: ((await r.json()) as { number?: number }).number }, { status: 201 });
    if (r.status === 429) return Response.json({ error: "rate_limited" }, { status: 429 });
    // Field-level problems go back to the form (field id + code only).
    if (r.status === 400) {
      const issues = (((await r.json().catch(() => ({}))) as { issues?: { path: string; message: string }[] }).issues ?? []).slice(0, 60).map((i) => ({ path: String(i.path).slice(0, 40), message: String(i.message).slice(0, 40) }));
      return Response.json({ error: "invalid", issues }, { status: 400 });
    }
    return Response.json({ fallback: true }, { status: 503 });
  } catch {
    return Response.json({ fallback: true }, { status: 503 });
  }
}
