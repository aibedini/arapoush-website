"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import type { PublicForm } from "@/lib/forms";
import { telHref, type Department } from "@/lib/contactText";
import { quoteMailto } from "@/lib/configurator/quote";
import { ASK_QUOTE, INDUSTRY_IDS, PICK_INDUSTRY, t, type Applications, type AskDetail } from "@/lib/applicationsText";
import LazyOpexForm from "@/components/forms/LazyOpexForm";
import RollText from "@/components/ui/RollText";
import styles from "./Applications.module.css";

const lp = (l: Record<string, string> | undefined, locale: string) => l?.[locale] || l?.en || l?.fa || "";

/**
 * Industry-aware request (OPEX form `applications-quote`). The industry comes from the open tab,
 * a "request a quote" button in a panel, or the finder (which also passes contents and priority);
 * the form then shows that industry's questions. After sending: the ticket number and who follows
 * it up. Without OPEX, the visitor's email app opens with the answers.
 */
export default function AppQuote({ c, form, forms, department, email, locale }: { c: Applications["quote"]; form: PublicForm; forms: Dictionary["forms"]; department?: Department; email: string; locale: string }) {
  const [initial, setInitial] = useState<Record<string, string> | undefined>(undefined);
  const [priority, setPriority] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromFinder = (e: Event) => {
      const d = (e as CustomEvent<AskDetail>).detail ?? {};
      setInitial({ ...(d.industry ? { industry: d.industry } : {}), ...(d.contents ? { contents: d.contents } : {}) });
      setPriority(d.priority ?? "");
    };
    // The open tab follows the visitor around; a panel's quote button asks for its industry.
    const fromTab = (e: Event) => setInitial((s) => ({ ...s, industry: (e as CustomEvent<string>).detail }));
    const onClick = (e: MouseEvent) => {
      const id = (e.target as Element | null)?.closest?.("[data-ask-industry]")?.getAttribute("data-ask-industry");
      if (id && (INDUSTRY_IDS as string[]).includes(id)) setInitial((s) => ({ ...s, industry: id }));
    };
    const fromHash = () => {
      const id = location.hash.slice(1);
      if ((INDUSTRY_IDS as string[]).includes(id)) setInitial((s) => ({ ...s, industry: id }));
    };
    fromHash();
    addEventListener(ASK_QUOTE, fromFinder);
    addEventListener(PICK_INDUSTRY, fromTab);
    addEventListener("hashchange", fromHash);
    document.addEventListener("click", onClick);
    return () => {
      removeEventListener(ASK_QUOTE, fromFinder);
      removeEventListener(PICK_INDUSTRY, fromTab);
      removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const success = ({ number, reset }: { number: number | null; reset: () => void }) => (
    <div ref={(el) => void (panel.current = el, el?.focus())} tabIndex={-1} className={styles.qDone} role="status" aria-live="polite">
      <p className={styles.qDoneTitle}>{t(c.sentTitle, locale)}</p>
      {number !== null && (
        <p className={styles.qTicket}>
          <span>{t(c.numberLabel, locale)}</span>
          <strong dir="ltr">#{number}</strong>
        </p>
      )}
      {department && (
        <div className={styles.qFollow}>
          <p>{t(c.followUp, locale).replace("{department}", lp(department.name, locale))}</p>
          <ul>
            {department.phones[0] && (
              <li>
                <a href={telHref(department.phones[0])} dir="ltr">
                  {department.phones[0]}
                </a>
              </li>
            )}
            {department.email && (
              <li>
                <a href={`mailto:${department.email}`} dir="ltr">
                  {department.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      )}
      <button type="button" className="btn btn--ghost" onClick={reset}>
        <RollText text={t(c.again, locale)} />
      </button>
    </div>
  );

  return (
    <section id="quote" className={styles.quote} aria-labelledby="quote-title">
      <div className={styles.inner}>
        <div className={styles.quoteGrid}>
          <header className={`${styles.quoteHead} ${styles.onDark}`}>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="quote-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
          </header>
          <div className={styles.quoteForm}>
            <LazyOpexForm
              form={form}
              t={forms}
              locale={locale}
              page={typeof location === "undefined" ? `/${locale}` : location.pathname}
              initial={initial}
              values={{ source: priority ? "applications-finder" : "applications", priority }}
              success={success}
              onFallback={(v) => {
                const rows = form.fields
                  .filter((f) => f.type !== "hidden" && f.type !== "file" && v[f.id] !== undefined && v[f.id] !== "")
                  .map((f): [string, string] => [lp(f.label as Record<string, string>, locale), String(v[f.id])]);
                location.href = quoteMailto({ to: email, subject: t(c.title, locale), spec: [], fields: rows, link: location.href });
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
