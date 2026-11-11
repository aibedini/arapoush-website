/**
 * Sends a quote or contact request to OPEX through /api/forms. Returns "sent" when it was stored and
 * emailed to sales; "fallback" when OPEX is not set up or unreachable (the caller then opens the
 * visitor's email app, as before); "invalid" or "limited" for the caller to explain.
 */
export type InquiryPayload = {
  locale: string;
  page: string;
  subject: string;
  spec: string[];
  fields: { name: string; email: string; company?: string; phone?: string; mobile?: string; quantity?: string; message?: string };
};

export async function sendInquiry(form: "quote" | "contact", payload: InquiryPayload, guard: { website: string; shownAt: number }): Promise<"sent" | "fallback" | "invalid" | "limited"> {
  const fields = Object.fromEntries(Object.entries(payload.fields).filter(([, v]) => typeof v === "string" && v.trim())) as InquiryPayload["fields"];
  try {
    const r = await fetch(`/api/forms/${form}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, fields, ...guard }) });
    if (r.status === 201 || r.status === 202) return "sent";
    if (r.status === 400) return "invalid";
    if (r.status === 429) return "limited";
    return "fallback";
  } catch {
    return "fallback";
  }
}
