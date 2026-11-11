import fs from "node:fs";
import path from "node:path";
import raw from "@/content/printing.json";
import type { Printing } from "@/lib/printingText";
import { entry } from "@/lib/content";

export * from "@/lib/printingText";

/**
 * Printing page content (OPEX `page.printing`, or content/printing.json without OPEX). A download is
 * offered only when its file is real: an OPEX media file (/media/…), or a file under /public whose
 * size is read from disk, so the card never shows a made-up figure.
 */
export function getPrinting(): Printing {
  const fromOpex = entry<Record<string, unknown>>("page.printing");
  const content = structuredClone(fromOpex ?? raw) as Record<string, unknown>;
  delete content.images; // page images are read through getDictionary().media
  const data = content as unknown as Printing;
  data.downloads.items = data.downloads.items.map((d) => {
    if (!d.file) return d;
    if (d.file.startsWith("/media/")) return d;
    const abs = path.join(process.cwd(), "public", d.file.replace(/^\//, ""));
    return fs.existsSync(abs) ? { ...d, size: fs.statSync(abs).size } : { ...d, file: null };
  });
  return data;
}
