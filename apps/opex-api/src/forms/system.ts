import { DEFAULT_SETTINGS, type FormDefinition, type FormField } from "@arapoush/schema";

/** Built-in forms live in @arapoush/schema so the website can render them when OPEX is off. */
export { SYSTEM_FORMS } from "@arapoush/schema";

const name: FormField = { id: "name", type: "text", role: "name", required: true, width: "half", label: { fa: "نام و نام خانوادگی", en: "Full name", tr: "Ad soyad" }, max: 120 };
const email: FormField = { id: "email", type: "email", role: "email", required: true, width: "half", label: { fa: "ایمیل", en: "Email", tr: "E-posta" } };
const message: FormField = { id: "message", type: "textarea", role: "message", label: { fa: "پیام", en: "Message", tr: "Mesaj" }, max: 4000 };

/** A new form starts with the fields almost every form needs. */
export const starterDefinition = (title: string): FormDefinition => ({
  title: { fa: title },
  intro: {},
  submitLabel: { fa: "ارسال", en: "Send", tr: "Gönder" },
  success: { fa: "دریافت شد. سپاس از شما.", en: "Received. Thank you.", tr: "Alındı. Teşekkürler." },
  fields: [name, email, { ...message, required: true }],
  settings: { ...DEFAULT_SETTINGS },
});
