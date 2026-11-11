import { DEFAULT_SETTINGS, type FormDefinition, type FormField } from "@arapoush/schema";

/**
 * The two forms built-in site components post to (the configurator's quote sheet and contact).
 * Their field ids match those components; operators can relabel, add fields and change routing.
 */
const name: FormField = { id: "name", type: "text", role: "name", required: true, width: "half", label: { fa: "نام و نام خانوادگی", en: "Full name", tr: "Ad soyad" }, max: 120 };
const company: FormField = { id: "company", type: "text", role: "company", width: "half", label: { fa: "شرکت", en: "Company", tr: "Şirket" }, max: 160 };
const email: FormField = { id: "email", type: "email", role: "email", required: true, width: "half", label: { fa: "ایمیل", en: "Email", tr: "E-posta" } };
const phone: FormField = { id: "phone", type: "phone", role: "phone", width: "half", label: { fa: "تلفن", en: "Phone", tr: "Telefon" }, max: 40 };
const message: FormField = { id: "message", type: "textarea", role: "message", label: { fa: "پیام", en: "Message", tr: "Mesaj" }, max: 4000 };

export const SYSTEM_FORMS: { slug: string; definition: FormDefinition }[] = [
  {
    slug: "quote",
    definition: {
      title: { fa: "درخواست قیمت", en: "Request a quote", tr: "Teklif isteyin" },
      intro: {},
      submitLabel: { fa: "ارسال درخواست", en: "Send request", tr: "Talebi gönder" },
      success: { fa: "درخواست شما رسید. همکاران فروش به‌زودی با شما تماس می‌گیرند.", en: "Your request has arrived. Our sales team will be in touch shortly.", tr: "Talebiniz ulaştı. Satış ekibimiz kısa süre içinde sizinle iletişime geçecek." },
      fields: [name, company, email, phone, { id: "quantity", type: "text", width: "half", label: { fa: "تیراژ", en: "Quantity", tr: "Miktar" }, max: 60 }, message],
      settings: { ...DEFAULT_SETTINGS, team: "sales", tags: ["quote"], subject: "" },
    },
  },
  {
    slug: "contact",
    definition: {
      title: { fa: "تماس با ما", en: "Contact us", tr: "Bize ulaşın" },
      intro: {},
      submitLabel: { fa: "ارسال پیام", en: "Send message", tr: "Mesajı gönder" },
      success: { fa: "پیام شما رسید. به‌زودی پاسخ می‌دهیم.", en: "Your message has arrived. We will reply soon.", tr: "Mesajınız ulaştı. Yakında yanıt vereceğiz." },
      fields: [name, company, email, phone, { ...message, required: true }],
      settings: { ...DEFAULT_SETTINGS, team: "sales", tags: ["contact"] },
    },
  },
];

/** A new form starts with the fields almost every form needs. */
export const starterDefinition = (title: string): FormDefinition => ({
  title: { fa: title },
  intro: {},
  submitLabel: { fa: "ارسال", en: "Send", tr: "Gönder" },
  success: { fa: "دریافت شد. سپاس از شما.", en: "Received. Thank you.", tr: "Alındı. Teşekkürler." },
  fields: [name, email, { ...message, required: true }],
  settings: { ...DEFAULT_SETTINGS },
});
