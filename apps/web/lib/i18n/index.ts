import type { Locale } from "./config";
import en, { type Dictionary } from "./dictionaries/en";
import fa from "./dictionaries/fa";
import tr from "./dictionaries/tr";

const dictionaries: Record<Locale, Dictionary> = { fa, en, tr };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
export * from "./config";
