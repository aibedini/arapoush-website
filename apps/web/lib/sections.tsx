import type { ComponentType } from "react";
import type { BlogCard } from "@/lib/blog";
import { BLOCK_KINDS, isBlockKind, SECTION_ENTRY, type BlockKind, type BlockProps } from "@arapoush/schema";
import type { Dictionary, Locale } from "@/lib/i18n";
import Hero from "@/components/sections/Hero";
import Products from "@/components/sections/Products";
import Applications from "@/components/sections/Applications";
import Insights from "@/components/sections/Insights";
import TrustedPartners from "@/components/sections/TrustedPartners";
import Certifications from "@/components/sections/Certifications";
import Block from "@/components/sections/blocks/Block";
import EditScope from "@/components/opex/EditScope";

/** Every page section receives the same props, so any of them can be placed anywhere. */
/** `posts`: the newest journal articles (home "Insights"); absent until the first is published. */
export type SectionProps = { t: Dictionary; locale: Locale; posts?: BlogCard[] };

export const sectionRegistry = {
  hero: { label: "Hero slideshow", Component: Hero },
  products: { label: "Our products", Component: Products },
  applications: { label: "Applications", Component: Applications },
  insights: { label: "Insights & journal", Component: Insights },
  partners: { label: "Trusted partners", Component: TrustedPartners },
  certifications: { label: "Certifications", Component: Certifications },
} satisfies Record<string, { label: string; Component: ComponentType<SectionProps> }>;

export type SectionType = keyof typeof sectionRegistry;

/** Built-in sections read their own entries; page-builder blocks (P12) carry their data in `props`. */
export type SectionConfig = { id: string; type: SectionType | BlockKind; enabled: boolean; props?: BlockProps };
export type PageLayout = { sections: SectionConfig[] };

export function isSectionType(value: string): value is SectionType {
  return value in sectionRegistry;
}

/** Validates a layout coming from a CMS: unknown types and duplicates are dropped. */
export function normalizeLayout(raw: { sections?: { id?: string; type?: string; enabled?: boolean; props?: unknown }[] }): SectionConfig[] {
  const seen = new Set<string>();
  return (raw.sections ?? []).flatMap((s) => {
    if (!s.type || !(isSectionType(s.type) || isBlockKind(s.type))) return [];
    const id = (s.id ?? s.type).replace(/[^\w-]/g, "");
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const props = s.props && typeof s.props === "object" && !Array.isArray(s.props) ? (s.props as BlockProps) : undefined;
    return [{ id, type: s.type as SectionType | BlockKind, enabled: s.enabled !== false, ...(props ? { props } : {}) }];
  });
}

const LABEL: Record<string, string> = { hero: "اسلایدر", products: "محصولات", applications: "کاربردها", insights: "مقاله‌ها", partners: "مشتریان", certifications: "گواهینامه‌ها", richText: "متن", imageText: "تصویر و متن", cta: "دعوت به اقدام", faq: "پرسش‌های پرتکرار", form: "فرم", spacer: "فاصله" };

/** The page's sections in order. In edit mode each is marked for the OPEX visual editor. */
export function Sections({ layout, edit = false, ...props }: SectionProps & { layout: SectionConfig[]; edit?: boolean }) {
  return (
    <>
      {layout.map((s, index) => {
        if (!s.enabled) return null;
        const block = isBlockKind(s.type);
        let body: React.ReactNode;
        if (block) body = <Block kind={s.type as BlockKind} id={s.id} props={s.props ?? {}} {...props} />;
        else {
          const { Component } = sectionRegistry[s.type as SectionType];
          body = <Component {...props} />;
        }
        return (
          <EditScope key={s.id} on={edit} section={s.id} label={LABEL[s.type] ?? s.type} entry={block ? "page.home.layout" : SECTION_ENTRY[s.type as SectionType]} base={block ? `/sections[${index}]/props` : undefined}>
            {body}
          </EditScope>
        );
      })}
    </>
  );
}

/** FAQ blocks for structured data (FAQPage) and llms-full.txt. */
export const faqItems = (layout: SectionConfig[], locale: Locale) =>
  layout
    .filter((s) => s.enabled && s.type === "faq")
    .flatMap((s) => s.props?.items ?? [])
    // No fallback to Persian: FAQPage markup on an en/tr page must be in that language (SEO audit).
    .map((it) => ({ q: it.q?.[locale] || "", a: it.a?.[locale] || "" }))
    .filter((x) => x.q && x.a);

export { BLOCK_KINDS };
