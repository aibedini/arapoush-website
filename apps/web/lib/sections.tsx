import type { ComponentType } from "react";
import type { Dictionary, Locale } from "@/lib/i18n";
import Hero from "@/components/sections/Hero";
import Products from "@/components/sections/Products";
import Applications from "@/components/sections/Applications";
import Insights from "@/components/sections/Insights";
import TrustedPartners from "@/components/sections/TrustedPartners";
import Certifications from "@/components/sections/Certifications";

/** Every page section receives the same props, so any of them can be placed anywhere. */
export type SectionProps = { t: Dictionary; locale: Locale };

export const sectionRegistry = {
  hero: { label: "Hero slideshow", Component: Hero },
  products: { label: "Our products", Component: Products },
  applications: { label: "Applications", Component: Applications },
  insights: { label: "Insights & journal", Component: Insights },
  partners: { label: "Trusted partners", Component: TrustedPartners },
  certifications: { label: "Certifications", Component: Certifications },
} satisfies Record<string, { label: string; Component: ComponentType<SectionProps> }>;

export type SectionType = keyof typeof sectionRegistry;

export type SectionConfig = { id: string; type: SectionType; enabled: boolean };
export type PageLayout = { sections: SectionConfig[] };

export function isSectionType(value: string): value is SectionType {
  return value in sectionRegistry;
}

/** Validates a layout coming from a CMS: unknown types and duplicates are dropped. */
export function normalizeLayout(raw: { sections?: { id?: string; type?: string; enabled?: boolean }[] }): SectionConfig[] {
  const seen = new Set<string>();
  return (raw.sections ?? []).flatMap((s) => {
    if (!s.type || !isSectionType(s.type)) return [];
    const id = s.id ?? s.type;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, type: s.type, enabled: s.enabled !== false }];
  });
}

export function Sections({ layout, ...props }: SectionProps & { layout: SectionConfig[] }) {
  return (
    <>
      {layout
        .filter((s) => s.enabled)
        .map((s) => {
          const { Component } = sectionRegistry[s.type];
          return <Component key={s.id} {...props} />;
        })}
    </>
  );
}
