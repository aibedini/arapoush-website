/** Quote request built from the configurator. Pure, so it is unit-tested with `node --test`. */

export type QuoteForm = { name: string; company: string; email: string; phone: string; quantity: string; message: string };
export type QuoteErrors = Partial<Record<keyof QuoteForm, "required" | "invalid">>;

export const EMPTY_QUOTE: QuoteForm = { name: "", company: "", email: "", phone: "", quantity: "", message: "" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateQuote(f: QuoteForm): QuoteErrors {
  const e: QuoteErrors = {};
  if (!f.name.trim()) e.name = "required";
  if (!f.email.trim()) e.email = "required";
  else if (!EMAIL.test(f.email.trim())) e.email = "invalid";
  if (f.quantity.trim() && !/^\d[\d,.\s]*$/.test(f.quantity.trim())) e.quantity = "invalid";
  return e;
}

/**
 * mailto: link with the configuration and the visitor's details in the body.
 * Every part is percent-encoded, so form input can't add headers or recipients.
 */
export function quoteMailto(o: { to: string; subject: string; spec: string[]; fields: [label: string, value: string][]; link: string }) {
  const body = [...o.spec, "", ...o.fields.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`), "", o.link].join("\n");
  return `mailto:${o.to}?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(body)}`;
}
