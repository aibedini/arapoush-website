import { getDictionary, type Locale } from "../lib/i18n";
import type { PublicForm } from "../lib/forms";

/** The site's real copy (code dictionaries; OPEX is off in Storybook). */
export const dict = (locale: unknown) => getDictionary((["fa", "en", "tr"].includes(String(locale)) ? locale : "fa") as Locale);

/** A form as OPEX publishes it (the "sample request" form from P11). */
export const sampleForm: PublicForm = {
  slug: "sample-request",
  version: 1,
  title: { fa: "درخواست نمونهٔ رایگان", en: "Request free samples", tr: "Ücretsiz numune isteyin" },
  intro: { fa: "نوع تیوب و تیراژ را بگویید.", en: "Tell us the tube type and quantity.", tr: "Tüp tipini ve miktarı belirtin." },
  submitLabel: { fa: "ارسال", en: "Send", tr: "Gönder" },
  success: { fa: "درخواست شما رسید.", en: "Your request has arrived.", tr: "Talebiniz ulaştı." },
  page: { enabled: true, indexable: true, title: {}, description: {} },
  fields: [
    { id: "name", type: "text", role: "name", required: true, width: "half", label: { fa: "نام و نام خانوادگی", en: "Full name", tr: "Ad soyad" } },
    { id: "company", type: "text", role: "company", width: "half", label: { fa: "شرکت", en: "Company", tr: "Şirket" } },
    { id: "email", type: "email", role: "email", required: true, width: "half", label: { fa: "ایمیل", en: "Email", tr: "E-posta" } },
    { id: "phone", type: "phone", role: "phone", width: "half", label: { fa: "تلفن", en: "Phone", tr: "Telefon" } },
    {
      id: "kind",
      type: "radio",
      required: true,
      label: { fa: "نوع تیوب", en: "Tube type", tr: "Tüp tipi" },
      options: [
        { value: "multi", label: { fa: "تیوب چندلایه", en: "Multi-layer tube", tr: "Çok katmanlı tüp" } },
        { value: "eff", label: { fa: "تیوب قرص جوشان", en: "Effervescent tube", tr: "Efervesan tüp" } },
      ],
    },
    { id: "diameter", type: "select", label: { fa: "قطر", en: "Diameter", tr: "Çap" }, showIf: { field: "kind", op: "eq", value: "multi" }, options: [{ value: "25", label: { fa: "۲۵ میلی‌متر", en: "25 mm" } }, { value: "35", label: { fa: "۳۵ میلی‌متر", en: "35 mm" } }] },
    { id: "message", type: "textarea", role: "message", label: { fa: "توضیحات", en: "Notes", tr: "Notlar" } },
    { id: "consent", type: "consent", required: true, label: { fa: "اجازه می‌دهم با من تماس بگیرند.", en: "You may contact me about this request.", tr: "Benimle iletişime geçilebilir." } },
  ],
};

/** Replaces window.fetch for one story; returns the restore function (use in beforeEach). */
export function mockFetch(status: number, body: unknown) {
  const real = window.fetch;
  window.fetch = async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return () => {
    window.fetch = real;
  };
}
