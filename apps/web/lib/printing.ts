import fs from "node:fs";
import path from "node:path";
import raw from "@/content/printing.json";
import type { Printing } from "@/lib/printingText";

export * from "@/lib/printingText";

/**
 * Printing page content. A download is offered only when its file really exists under /public;
 * its size is read from disk so the card never shows a made-up figure.
 */
export function getPrinting(): Printing {
  const data = structuredClone(raw) as unknown as Printing;
  data.downloads.items = data.downloads.items.map((d) => {
    if (!d.file) return d;
    const abs = path.join(process.cwd(), "public", d.file.replace(/^\//, ""));
    return fs.existsSync(abs) ? { ...d, size: fs.statSync(abs).size } : { ...d, file: null };
  });
  return data;
}
