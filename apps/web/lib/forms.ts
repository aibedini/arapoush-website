import type { FormField, L } from "@arapoush/schema";

/**
 * Website forms → OPEX (P8, P11). The browser posts to /api/forms/{slug}; that route adds the
 * visitor's IP and forwards with the delivery token, so OPEX credentials never reach the browser.
 * Browser-safe: the server-side lookups are in lib/content/forms.ts.
 */

/** A published form as the Delivery API serves it (no routing, rules or notify addresses). */
export type PublicForm = {
  slug: string;
  version: number;
  title: L;
  intro: L;
  submitLabel: L;
  success: L;
  fields: FormField[];
  page: { enabled: boolean; indexable: boolean; title: L; description: L };
};

export const formPath = (slug: string) => `/forms/${slug}`;

export type SendResult = "sent" | "fallback" | "invalid" | "limited";

/** The quote sheet and contact (P8 shape). */
export type InquiryPayload = {
  locale: string;
  page: string;
  subject: string;
  spec: string[];
  fields: { name: string; email: string; company?: string; phone?: string; mobile?: string; quantity?: string; message?: string };
};

async function post(slug: string, body: unknown): Promise<{ result: SendResult; issues?: { path: string; message: string }[]; number?: number }> {
  try {
    const r = await fetch(`/api/forms/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 201 || r.status === 202) return { result: "sent", number: ((await r.json().catch(() => ({}))) as { number?: number }).number };
    if (r.status === 400) return { result: "invalid", issues: ((await r.json().catch(() => ({}))) as { issues?: { path: string; message: string }[] }).issues };
    if (r.status === 429) return { result: "limited" };
    return { result: "fallback" };
  } catch {
    return { result: "fallback" };
  }
}

export async function sendInquiry(form: "quote" | "contact", payload: InquiryPayload, guard: { website: string; shownAt: number }): Promise<SendResult> {
  const fields = Object.fromEntries(Object.entries(payload.fields).filter(([, v]) => typeof v === "string" && v.trim())) as InquiryPayload["fields"];
  return (await post(form, { ...payload, fields, ...guard })).result;
}

/** Any form built in OPEX. */
export function sendForm(
  slug: string,
  body: { locale: string; page: string; values: Record<string, unknown>; files?: { field: string; name: string; data: string }[]; context?: { subject?: string; spec?: string[] } },
  guard: { website: string; shownAt: number },
) {
  return post(slug, { ...body, ...guard });
}
