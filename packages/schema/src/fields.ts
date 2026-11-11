/**
 * Field definitions: the building blocks every content type is made of. Values are plain JSON so
 * they travel unchanged between the website, the API, the console and AraCMS.
 */

export const LOCALES = ["fa", "en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fa";
/** Fallback order when a localized value is missing. */
export const FALLBACK: Record<Locale, Locale[]> = { fa: ["fa", "en"], en: ["en", "fa"], tr: ["tr", "en", "fa"] };

/** A value per locale. Any locale may be missing; readers fall back (see FALLBACK). */
export type Localized<T = string> = Partial<Record<Locale, T>>;

/** An image reference. `src` is a site path (/images/… or /media/…). */
export type ImageValue = { src: string; width?: number; height?: number; alt?: Localized };
/** An image that may differ per locale (e.g. artwork with Persian lettering). */
export type LocalizedImageValue = { default: ImageValue } & Partial<Record<Locale, ImageValue>>;
export type FileValue = { src: string; bytes?: number; mime?: string };

type Common = {
  /** Shown in the console; English. */
  label?: string;
  help?: string;
  /** Visible and versioned, but only super admins may change it (3D, geometry, brand marks). */
  locked?: boolean;
  /** Editable by OPEX operators only; never grantable to partners (logic, a11y-critical copy). */
  operatorOnly?: boolean;
  required?: boolean;
};

export type TextField = Common & { kind: "text"; localized: boolean; max?: number; multiline?: boolean; persianNormalize?: boolean };
export type NumberField = Common & { kind: "number"; integer?: boolean; min?: number; max?: number };
export type BooleanField = Common & { kind: "boolean" };
export type EnumField = Common & { kind: "enum"; values: string[] };
export type UrlField = Common & { kind: "url"; localized?: boolean; internal?: boolean };
/** `path`: the value is a bare site path string (legacy content shape) instead of { src, width, height }. */
export type ImageField = Common & { kind: "image"; perLocale?: boolean; path?: boolean; ratio?: string };
export type FileField = Common & { kind: "file"; formats?: string[] };
export type ListField = Common & { kind: "list"; of: Field; key?: string; min?: number; max?: number; fixed?: boolean };
export type GroupField = Common & { kind: "group"; fields: Record<string, Field> };

export type Field = TextField | NumberField | BooleanField | EnumField | UrlField | ImageField | FileField | ListField | GroupField;

export type ContentType = {
  key: string;
  label: string;
  /** Pages and globals are singletons; collections hold many entries. */
  singleton: boolean;
  schema: GroupField;
  /** Bumped on breaking schema changes; a migration must exist for each step. */
  version: number;
};

export const isLocalizedText = (v: unknown): v is Localized =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => (LOCALES as readonly string[]).includes(k)) && Object.values(v).every((x) => typeof x === "string");

export const isImage = (v: unknown): v is ImageValue => !!v && typeof v === "object" && typeof (v as ImageValue).src === "string" && /^\/(images|media)\//.test((v as ImageValue).src);

export const isLocalizedImage = (v: unknown): v is LocalizedImageValue => !!v && typeof v === "object" && isImage((v as LocalizedImageValue).default);
