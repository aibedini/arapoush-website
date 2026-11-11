import { connect } from "node:net";
import sharp from "sharp";

/**
 * Upload inspection (plan §3.6): the real type comes from magic bytes, never from the file name
 * or the client's Content-Type. Images are re-encoded (strips EXIF/GPS, normalises to sRGB, kills
 * polyglots); SVG and PDF are checked for active content.
 */
export type Kind = "jpeg" | "png" | "webp" | "avif" | "gif" | "svg" | "pdf";
export const MIME: Record<Kind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf" };

export function sniff(buf: Buffer): Kind | null {
  const h = (s: number, e: number) => buf.subarray(s, e);
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (h(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (h(0, 4).toString("latin1") === "RIFF" && h(8, 12).toString("latin1") === "WEBP") return "webp";
  if (h(4, 12).toString("latin1") === "ftypavif") return "avif";
  if (h(0, 6).toString("latin1") === "GIF87a" || h(0, 6).toString("latin1") === "GIF89a") return "gif";
  if (h(0, 5).toString("latin1") === "%PDF-") return "pdf";
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

/** Re-encodes a raster image: WebP (or keeps GIF frames out), max 4096 px, metadata stripped. */
export async function reencode(buf: Buffer) {
  const img = sharp(buf, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
  const meta = await img.metadata();
  const out = await img
    .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
    .toColorspace("srgb")
    .webp({ quality: 88, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { buf: out.data, width: out.info.width, height: out.info.height, sourceFormat: meta.format };
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
