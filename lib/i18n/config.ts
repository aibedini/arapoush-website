export const locales = ["fa", "en", "tr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fa";

export const localeMeta: Record<Locale, { label: string; short: string; dir: "rtl" | "ltr"; intl: string; og: string }> = {
  fa: { label: "فارسی", short: "FA", dir: "rtl", intl: "fa-IR", og: "fa_IR" },
  en: { label: "English", short: "EN", dir: "ltr", intl: "en-US", og: "en_US" },
  tr: { label: "Türkçe", short: "TR", dir: "ltr", intl: "tr-TR", og: "tr_TR" },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
