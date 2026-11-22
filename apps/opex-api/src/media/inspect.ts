import { connect } from "node:net";
import sharp from "sharp";

/**
 * Upload inspection (plan §3.6): the real type comes from magic bytes, never from the file name
 * or the client's Content-Type. Images are re-encoded (strips EXIF/GPS, normalises to sRGB, kills
 * polyglots); SVG and PDF are checked for active content.
 */
export type Kind = "jpeg" | "png" | "webp" | "avif" | "gif" | "svg" | "pdf" | "mp4" | "webm" | "woff2" | "woff" | "ttf" | "otf";
export const MIME: Record<Kind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};
export const RASTER: Kind[] = ["jpeg", "png", "webp", "avif", "gif"];
/** Stored as uploaded after the type check: videos (slider backgrounds) and web fonts. */
export const PASSTHROUGH: Kind[] = ["mp4", "webm", "woff2", "woff", "ttf", "otf"];

export function sniff(buf: Buffer): Kind | null {
  const h = (s: number, e: number) => buf.subarray(s, e);
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (h(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (h(0, 4).toString("latin1") === "RIFF" && h(8, 12).toString("latin1") === "WEBP") return "webp";
  if (h(4, 12).toString("latin1") === "ftypavif") return "avif";
  if (h(0, 6).toString("latin1") === "GIF87a" || h(0, 6).toString("latin1") === "GIF89a") return "gif";
  if (h(0, 5).toString("latin1") === "%PDF-") return "pdf";
  // ISO media (ftyp box); image brands (AVIF/HEIF) are not video.
  if (h(4, 8).toString("latin1") === "ftyp" && /^(isom|iso[2-9]|mp4[12v]|avc1|dash|M4V |msnv|f4v )$/.test(h(8, 12).toString("latin1"))) return "mp4";
  if (h(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && buf.subarray(0, 64).toString("latin1").includes("webm")) return "webm";
  const tag = h(0, 4).toString("latin1");
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "otf";
  if (h(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || tag === "true") return "ttf";
  const head = buf.subarray(0, 2048).toString("utf8").trimStart().toLowerCase();
  if ((head.startsWith("<?xml") || head.startsWith("<svg")) && head.includes("<svg")) return "svg";
  return null;
}

export class Rejected extends Error {}

/** Rejects SVG with scripts, event handlers, external references or entities (logos only need shapes). */
export function checkSvg(text: string) {
  const s = text.toLowerCase();
  const bad = [/<script/, /\son[a-z]+\s*=/, /javascript:/, /<foreignobject/, /<!entity/, /<!doctype/, /(xlink:)?href\s*=\s*["'](?!#)/, /<iframe/, /<embed/, /<object/, /url\(\s*["']?(?!#)/];
  for (const re of bad) if (re.test(s)) throw new Rejected(`SVG contains disallowed content (${re.source})`);
}

/** Rejects PDFs that carry JavaScript, launch actions or embedded files. */
export function checkPdf(buf: Buffer) {
  const s = buf.toString("latin1");
  for (const k of ["/JavaScript", "/JS ", "/JS(", "/JS<", "/Launch", "/EmbeddedFile", "/RichMedia", "/XFA"]) if (s.includes(k)) throw new Rejected(`PDF contains ${k.trim()}`);
}

/**
 * How much an upload is compressed (the console asks; integrations that don't keep `standard`).
 * - `original`: the uploaded format at full quality (lossless where the format allows), up to 8192 px.
 * - `standard`: WebP 88, up to 4096 px (the long-standing default).
 * - `balanced`: WebP 82, up to 2560 px.
 * - `max`: WebP 68, up to 1920 px.
 * Every mode re-encodes, so metadata (EXIF, GPS) is always stripped. Transparency (PNG, WebP) survives.
 */
export const COMPRESSION = ["original", "standard", "balanced", "max"] as const;
export type Compression = (typeof COMPRESSION)[number];
const LIMIT: Record<Compression, number> = { original: 8192, standard: 4096, balanced: 2560, max: 1920 };

/** Re-encodes a raster image (metadata stripped, sRGB). Returns the stored bytes and their type. */
export async function reencode(buf: Buffer, mode: Compression = "standard", kind?: Kind) {
  const animated = kind === "gif" || kind === "webp";
  const img = sharp(buf, { limitInputPixels: 50_000_000, failOn: "error", animated: mode === "original" && animated }).rotate();
  const meta = await img.metadata();
  const size = LIMIT[mode];
  const resized = img.resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).toColorspace("srgb");
  let out: { data: Buffer; info: { width: number; height: number } };
  let mime = "image/webp";
  if (mode === "original" && kind === "jpeg") {
    out = await resized.jpeg({ quality: 100, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer({ resolveWithObject: true });
    mime = "image/jpeg";
  } else if (mode === "original" && kind === "png") {
    out = await resized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    mime = "image/png";
  } else if (mode === "original" && kind === "gif") {
    out = await resized.gif().toBuffer({ resolveWithObject: true });
    mime = "image/gif";
  } else if (mode === "original" && kind === "avif") {
    out = await resized.avif({ lossless: true }).toBuffer({ resolveWithObject: true });
    mime = "image/avif";
  } else if (mode === "original") {
    out = await resized.webp({ lossless: true }).toBuffer({ resolveWithObject: true });
  } else {
    const quality = mode === "max" ? 68 : mode === "balanced" ? 82 : 88;
    out = await resized.webp({ quality, alphaQuality: 90, effort: mode === "max" ? 6 : 4 }).toBuffer({ resolveWithObject: true });
  }
  // Animated sources report the full strip height; one frame is what pages lay out.
  const height = meta.pages && meta.pages > 1 && meta.pageHeight ? Math.round((meta.pageHeight * out.info.width) / (meta.width ?? out.info.width)) : out.info.height;
  return { buf: out.data, width: out.info.width, height, mime, sourceFormat: meta.format };
}

/** ClamAV INSTREAM scan. Returns "clean", "infected:<signature>", or throws when unreachable. */
export function clamScan(hostPort: string, buf: Buffer, timeoutMs = 20_000): Promise<string> {
  const [host, port] = hostPort.split(":");
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port: Number(port ?? 3310) });
    let reply = "";
    sock.setTimeout(timeoutMs, () => sock.destroy(new Error("ClamAV timeout")));
    sock.on("error", reject);
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => {
      const r = reply.replace(/\0/g, "").trim();
      if (r.endsWith("OK")) resolve("clean");
      else if (r.includes("FOUND")) resolve(`infected:${r.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, "")}`);
      else reject(new Error(`ClamAV: ${r}`));
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.end(Buffer.alloc(4));
    });
  });
}
