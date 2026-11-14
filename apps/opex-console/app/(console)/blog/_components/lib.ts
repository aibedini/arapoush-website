import type { BlogPostData, Locale } from "@arapoush/schema";

export type Status = "draft" | "review" | "scheduled" | "published" | "archived";
export const STATUS: Record<Status, [string, string]> = {
  draft: ["پیش‌نویس", ""],
  review: ["در انتظار بازبینی", "warn"],
  scheduled: ["زمان‌بندی‌شده", "accent"],
  published: ["منتشرشده", "ok"],
  archived: ["بایگانی", "bad"],
};
export const LOCALE_NAME: Record<Locale, string> = { fa: "فارسی", en: "English", tr: "Türkçe" };
export const PRODUCT_NAME: Record<string, string> = { tube: "تیوب چندلایه", effervescent: "تیوب قرص جوشان", printing: "چاپ روی تیوب", applications: "کاربرد در صنایع" };

export type PostSummary = {
  id: string;
  status: Status;
  titles: Partial<Record<Locale, string>>;
  live: Locale[];
  ready: Locale[];
  categoryId: string | null;
  authorId: string | null;
  cover: string | null;
  featured: boolean;
  unpublishedChanges: boolean;
  createdBy: string | null;
  mine: boolean;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
};
export type PostDetail = {
  id: string;
  status: Status;
  data: BlogPostData;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  revision: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  slugs: { locale: string; slug: string; current: boolean }[];
  can: { edit: boolean; publish: boolean; delete: boolean };
};
type Loc = Partial<Record<Locale, string>>;
export type Category = { id: string; name: Loc; slug: Loc; description: Loc; position: number; posts: number };
export type Tag = { id: string; name: Loc; slug: string; posts: number };
export type Author = { id: string; slug: string; name: Loc; role: Loc; bio: Loc; expertise: string[]; photo: { src: string; width?: number; height?: number } | null; sameAs: string[]; principalId: string | null; posts: number };
export type Taxonomy = { categories: Category[]; tags: Tag[]; authors: Author[] };

/** A localized name for the console (Persian first). */
export const nm = (v: Loc | undefined) => v?.fa || v?.en || v?.tr || "—";
export const newId = () => Math.random().toString(36).slice(2, 10);
/** Site address of a post, for previews and links. */
export const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
