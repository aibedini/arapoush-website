import { ensureContent } from "@/lib/content";
import { llmsText } from "@/lib/seo";
import { blogSettings, getBlogIndex } from "@/lib/blog";

export const dynamic = "force-static";

export async function GET() {
  await ensureContent();
  return new Response(llmsText(false, blogSettings().enabled ? await getBlogIndex() : undefined), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
