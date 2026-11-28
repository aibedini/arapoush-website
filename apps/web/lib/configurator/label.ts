/**
 * The visitor's own label artwork, read in the browser only (it is never uploaded). Images are drawn
 * as they are; PDF and Illustrator files (saved with "Create PDF Compatible File", Illustrator's
 * default) are rendered from their first page with pdf.js, which loads only when such a file is chosen.
 */

export type LabelKind = "image" | "pdf";
export type LabelArt = { src: string; width: number; height: number; name: string };
export type LabelError = "type" | "size" | "ai" | "read";

/** Longest side of the rendered artwork, in pixels: sharp on the tube without a huge texture. */
const MAX_SIDE = 2048;
export const LABEL_MAX_BYTES = 40 * 1024 * 1024;
export const LABEL_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.ai,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,application/postscript,application/illustrator";

/** Which reader a file needs, by extension and type; null when it is not a label format we read. */
export function labelKind(name: string, type = ""): LabelKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext) || /^image\/(png|jpeg|webp|svg\+xml)$/.test(type)) return "image";
  if (ext === "pdf" || ext === "ai" || type === "application/pdf" || type === "application/illustrator") return "pdf";
  return null;
}

/** A PDF (and an Illustrator file with PDF compatibility) starts with "%PDF" within its first KB. */
export function looksLikePdf(head: Uint8Array): boolean {
  const s = String.fromCharCode(...head.subarray(0, 1024));
  return s.includes("%PDF-");
}

/** Fits width × height inside `max` on the longest side, keeping the aspect. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export class LabelReadError extends Error {
  code: LabelError;
  constructor(code: LabelError) {
    super(code);
    this.code = code;
  }
}

const toUrl = (canvas: HTMLCanvasElement) =>
  new Promise<string>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new LabelReadError("read"))), "image/png"));

async function readImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // SVGs without a size report 0; give them a print-sized default.
    const w = img.naturalWidth || 1600;
    const h = img.naturalHeight || 1000;
    const size = fitSize(w, h);
    const c = document.createElement("canvas");
    c.width = size.width;
    c.height = size.height;
    c.getContext("2d")!.drawImage(img, 0, 0, size.width, size.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readPdf(file: File): Promise<HTMLCanvasElement> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(data)) throw new LabelReadError(file.name.toLowerCase().endsWith(".ai") ? "ai" : "read");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const size = fitSize(base.width * 4, base.height * 4);
    const viewport = page.getViewport({ scale: size.width / base.width });
    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    await page.render({ canvas: c, viewport, background: "rgba(0,0,0,0)" }).promise;
    return c;
  } finally {
    void task.destroy();
  }
}

/** Reads a label file into a PNG object URL. Revoke `src` with URL.revokeObjectURL when it is replaced. */
export async function readLabel(file: File): Promise<LabelArt> {
  const kind = labelKind(file.name, file.type);
  if (!kind) throw new LabelReadError("type");
  if (file.size > LABEL_MAX_BYTES) throw new LabelReadError("size");
  let canvas: HTMLCanvasElement;
  try {
    canvas = kind === "pdf" ? await readPdf(file) : await readImage(file);
  } catch (e) {
    throw e instanceof LabelReadError ? e : new LabelReadError("read");
  }
  return { src: await toUrl(canvas), width: canvas.width, height: canvas.height, name: file.name };
}
