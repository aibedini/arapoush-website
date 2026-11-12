/**
 * Email-app fallback for the quote (the form itself is the OPEX form `tube-quote`, validated by the
 * shared form validator). Pure, so it is unit-tested with `node --test`.
 */

/**
 * mailto: link with the configuration and the visitor's details in the body.
 * Every part is percent-encoded, so form input can't add headers or recipients.
 */
export function quoteMailto(o: { to: string; subject: string; spec: string[]; fields: [label: string, value: string][]; link: string }) {
  const body = [...o.spec, "", ...o.fields.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`), "", o.link].join("\n");
  return `mailto:${o.to}?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(body)}`;
}
