/**
 * Text hygiene applied to every text value before it is stored (plan §3.5).
 */

// Bidi controls can make text read differently than it is stored (Trojan Source style spoofing).
const BIDI = /[‪-‮⁦-⁩]/;
// C0/C1 controls except tab and newline.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export class TextRejected extends Error {
  readonly code = "TEXT_REJECTED";
}

export function sanitizeText(input: string, opts: { persian?: boolean; multiline?: boolean } = {}): string {
  if (BIDI.test(input)) throw new TextRejected("Text contains bidirectional override characters");
  let s = input.normalize("NFC").replace(CONTROL, "");
  if (!opts.multiline) s = s.replace(/[\r\n]+/g, " ");
  else s = s.replace(/\r\n?/g, "\n");
  // Arabic Yeh/Kaf → Persian forms (they look alike but break search and sorting).
  if (opts.persian) s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
  return s;
}

const SAFE_SCHEMES = ["https:", "mailto:", "tel:"];

/** Accepts https, mailto, tel and site-relative paths/anchors; rejects everything else (javascript:, data:, http:). */
export function sanitizeUrl(input: string, opts: { internal?: boolean } = {}): string {
  const s = input.trim();
  if (BIDI.test(s) || CONTROL.test(s)) throw new TextRejected("URL contains control characters");
  if (/^#[\w-]*$/.test(s)) return s;
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s;
  if (opts.internal) throw new TextRejected("Only site paths are allowed here");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new TextRejected("Not a valid URL");
  }
  if (!SAFE_SCHEMES.includes(u.protocol)) throw new TextRejected(`URL scheme ${u.protocol} is not allowed`);
  return u.toString();
}
