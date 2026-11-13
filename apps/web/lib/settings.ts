import { entry } from "@/lib/content";

/** Public site settings from OPEX (S3): analytics ids, verification tokens, indexing, security contact. */
export type SiteSettings = {
  analytics: {
    ga4: string | null;
    gtm: string | null;
    clarity: string | null;
    yandex: string | null;
    matomo: { url: string; siteId: string } | null;
    consent: boolean;
    verification: { google: string | null; bing: string | null; yandex: string | null };
  };
  indexing: boolean;
  security: { contactEmail: string | null; policyUrl: string | null };
};

const DEFAULTS: SiteSettings = {
  analytics: { ga4: null, gtm: null, clarity: null, yandex: null, matomo: null, consent: true, verification: { google: null, bing: null, yandex: null } },
  indexing: true,
  security: { contactEmail: null, policyUrl: null },
};

// Checked again here (OPEX already validates): only ids reach the page, never markup.
const ok = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);

export function siteSettings(): SiteSettings {
  const s = entry<Partial<SiteSettings>>("settings.site");
  if (!s) return DEFAULTS;
  const a = (s.analytics ?? {}) as Partial<SiteSettings["analytics"]>;
  const v = (a.verification ?? {}) as Partial<SiteSettings["analytics"]["verification"]>;
  const m = a.matomo && ok(a.matomo.url, /^https:\/\/[\w.-]+(\/[\w./-]*)?$/) && ok(a.matomo.siteId, /^\d{1,6}$/) ? { url: a.matomo.url.replace(/\/?$/, "/"), siteId: a.matomo.siteId } : null;
  return {
    analytics: {
      ga4: ok(a.ga4, /^G-[A-Z0-9]{4,12}$/),
      gtm: ok(a.gtm, /^GTM-[A-Z0-9]{4,10}$/),
      clarity: ok(a.clarity, /^[a-z0-9]{6,12}$/),
      yandex: ok(a.yandex, /^\d{5,12}$/),
      matomo: m,
      consent: a.consent !== false,
      verification: { google: ok(v.google, /^[\w-]{10,100}$/), bing: ok(v.bing, /^[\w-]{10,100}$/), yandex: ok(v.yandex, /^[\w-]{10,100}$/) },
    },
    indexing: s.indexing !== false,
    security: {
      contactEmail: ok(s.security?.contactEmail, /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i),
      policyUrl: ok(s.security?.policyUrl, /^https:\/\/[^\s<>"]+$/),
    },
  };
}

export const hasAnalytics = (a: SiteSettings["analytics"]) => !!(a.ga4 || a.gtm || a.clarity || a.yandex || a.matomo);
