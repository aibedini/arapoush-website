import { ensureContent } from "@/lib/content";
import { siteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site";

/** RFC 9116 security.txt from Settings → Security (S3). 404 until a contact is set. */
export const revalidate = 3600;

export async function GET() {
  await ensureContent();
  const s = siteSettings().security;
  if (!s.contactEmail) return new Response("Not found", { status: 404 });
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const lines = [`Contact: mailto:${s.contactEmail}`, `Expires: ${expires}`, "Preferred-Languages: fa, en, tr", `Canonical: ${siteUrl}/.well-known/security.txt`, ...(s.policyUrl ? [`Policy: ${s.policyUrl}`] : [])];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
