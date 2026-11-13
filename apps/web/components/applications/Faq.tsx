"use client";

import { useState } from "react";
import { t, type Applications } from "@/lib/applicationsText";
import styles from "./Applications.module.css";

/**
 * Questions filtered by industry. Every question is in the HTML (and in the FAQPage JSON-LD); the
 * filter only hides the ones for other industries. Questions for every industry always show.
 */
export default function Faq({ c, industries, locale }: { c: Applications["faq"]; industries: Applications["industries"]["items"]; locale: string }) {
  const [filter, setFilter] = useState("all");
  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-title">
      <div className={`${styles.inner} ${styles.faqInner}`}>
        <header className={styles.head}>
          <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="faq-title" className={styles.h2} data-reveal>
            {t(c.title, locale)}
          </h2>
        </header>
        <div className={styles.filters} role="group" aria-label={t(c.title, locale)}>
          {[{ id: "all", label: t(c.all, locale) }, ...industries.map((x) => ({ id: x.id, label: t(x.name, locale) }))].map((f) => (
            <button key={f.id} type="button" className={styles.filter} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.faqList}>
          {c.items.map((q) => (
            <details key={q.q.en} className={styles.faqItem} hidden={filter !== "all" && q.industries.length > 0 && !(q.industries as string[]).includes(filter)}>
              <summary>{t(q.q, locale)}</summary>
              <p>{t(q.a, locale)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
