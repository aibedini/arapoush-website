import { revalidateTag } from "next/cache";
import { replayCache, verifySignature } from "@/lib/content/webhook";

/**
 * OPEX calls this after a publish (docs/opex/OPEX-PLAN.md §10.2). The body is signed with the shared
 * secret; old or replayed events are refused. Every page built from OPEX content is then regenerated
 * on its next visit.
 */
export const dynamic = "force-dynamic";

const fresh = replayCache();

export async function POST(req: Request) {
  const secret = process.env.OPEX_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  const body = await req.text();
  if (body.length > 64_000 || !verifySignature(secret, req.headers.get("opex-signature"), body)) return new Response(null, { status: 401 });
  let event: { id?: unknown };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof event.id !== "string" || !fresh(event.id)) return new Response(null, { status: 409 });
  // One tag covers the bundle every page reads; global.site changes reach every page this way too.
  revalidateTag("opex");
  return new Response(null, { status: 204 });
}
