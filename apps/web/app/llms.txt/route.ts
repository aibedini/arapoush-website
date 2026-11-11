import { ensureContent } from "@/lib/content";
import { llmsText } from "@/lib/seo";

export const dynamic = "force-static";

export async function GET() {
  await ensureContent();
  return new Response(llmsText(false), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
