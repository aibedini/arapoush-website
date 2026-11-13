/**
 * JSON-LD for a `<script type="application/ld+json">`: escapes `<`, `>`, `&` and the JS line
 * separators so content from OPEX can never close the script tag (S2: stored XSS).
 */
export function jsonLdHtml(data: unknown): string {
  const esc: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => esc[c]!);
}
