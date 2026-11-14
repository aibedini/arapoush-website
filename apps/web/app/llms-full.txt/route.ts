import { ensureContent } from "@/lib/content";
import { llmsText } from "@/lib/seo";
import { getBlogIndex } from "@/lib/blog";

export const dynamic = "force-static";

export async function GET() {
  await ensureContent();
  return new Response(llmsText(true, await getBlogIndex()), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
