"use client";

import { blogChecks, checkScore, type BlogPostData, type Locale } from "@arapoush/schema";
import { siteBase } from "./lib";

const AREA: Record<string, string> = { seo: "سئو", geo: "GEO (موتورهای هوش مصنوعی)", content: "محتوا" };
const ICON = { good: "✓", warn: "!", bad: "×" } as const;

/** Live checklist for one language, plus how the result may look on Google. */
export function SeoPanel({ data, locale }: { data: BlogPostData; locale: Locale }) {
  const t = data.translations[locale];
  const checks = blogChecks(data, locale);
  const score = checkScore(checks);
  const tone = score >= 80 ? "ok" : score >= 55 ? "warn" : "bad";
  const title = (t?.seo.title || t?.title || "").trim();
  const desc = (t?.seo.description || t?.excerpt || "").trim();
  const host = siteBase().replace(/^https?:\/\//, "") || "arapoush.com";
  return (
    <section className="card" aria-labelledby="seo-h">
      <div className="card-head">
        <h2 id="seo-h">سئو و GEO</h2>
        <span className={`badge ${tone}`} aria-label={`امتیاز ${score} از ۱۰۰`}>
          {score.toLocaleString("fa-IR")} / ۱۰۰
        </span>
      </div>
      <div className="card-body stack">
        <div className="serp" aria-label="پیش‌نمایش نتیجهٔ گوگل" dir={locale === "fa" ? "rtl" : "ltr"}>
          <div className="serp-url" dir="ltr">
            {host} › {locale} › blog › <bdi>{t?.slug || "…"}</bdi>
          </div>
          <div className="serp-title">{title ? (title.length > 62 ? `${title.slice(0, 60)}…` : title) : "عنوان مقاله"}</div>
          <div className="serp-desc">{desc ? (desc.length > 160 ? `${desc.slice(0, 158)}…` : desc) : "توضیح متا یا خلاصهٔ مقاله اینجا نمایش داده می‌شود."}</div>
        </div>
        {(["seo", "geo", "content"] as const).map((area) => {
          const list = checks.filter((c) => c.area === area);
          if (!list.length) return null;
          return (
            <div key={area}>
              <div className="small" style={{ fontWeight: 700, marginBlockEnd: 4 }}>
                {AREA[area]}
              </div>
              <ul className="checks">
                {list.map((c) => (
                  <li key={c.key} data-level={c.level}>
                    <span aria-hidden="true">{ICON[c.level]}</span>
                    <span>
                      <span className="sr-only">{c.level === "good" ? "درست: " : c.level === "warn" ? "پیشنهاد: " : "مشکل: "}</span>
                      {c.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
