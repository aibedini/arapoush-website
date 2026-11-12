import raw from "@/content/about.json";
import type { About } from "@/lib/aboutText";
import { entry } from "@/lib/content";

export * from "@/lib/aboutText";

/** About page content (OPEX `page.about`, or content/about.json without OPEX). */
export function getAbout(): About {
  const content = structuredClone(entry<Record<string, unknown>>("page.about") ?? raw) as Record<string, unknown>;
  delete content.images; // page images are read through getDictionary().media
  delete content.$comment;
  return content as unknown as About;
}
