"use client";

import { useId, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import type { PublicForm } from "@/lib/forms";
import { quoteMailto } from "@/lib/configurator/quote";
import { telHref, type Department } from "@/lib/contactText";
import LazyOpexForm from "@/components/forms/LazyOpexForm";
import RollText from "@/components/ui/RollText";
import styles from "./Configurator.module.css";

type Props = {
  t: Dictionary["productTube"]["configurator"];
  forms: Dictionary["forms"];
  form: PublicForm;
  /** Hidden-field values: the selected configuration. */
  values: Record<string, string>;
  spec: string[];
  subjectSpec: string;
  search: string;
  /** Sales inbox for the email-app fallback. */
  email: string;
  locale: string;
  /** Who follows the request up (contact page department), shown with the ticket number. */
  department?: Department;
};

const lp = (l: Record<string, string> | undefined, locale: string) => l?.[locale] || l?.en || l?.fa || "";

/**
 * Quote request (T5): the OPEX form `tube-quote` (fields, labels and routing are managed in OPEX),
 * with the configuration attached as hidden fields and ticket context. After sending, the visitor
 * sees the ticket number and the department and people to quote it to. Without OPEX, or if it
 * cannot take the request, the visitor's email app opens with everything filled in.
 */
export default function QuoteForm({ t, forms, form, values, spec, subjectSpec, search, email, locale, department }: Props) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const success = ({ number, reset, values: sent }: { number: number | null; reset: () => void; values: Record<string, unknown> }) => (
    <div ref={(el) => void (panel.current = el, el?.focus())} tabIndex={-1} className={styles.quoteDone} role="status" aria-live="polite">
      <p className={styles.quoteDoneTitle}>{t.quoteSentTitle}</p>
      {number !== null && (
        <div className={styles.ticket}>
          <span className={styles.ticketLabel}>{t.quoteNumberLabel}</span>
          <strong className={styles.ticketNumber} dir="ltr">
            #{number}
          </strong>
          <button
            type="button"
            className={styles.copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(String(number));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked: the number stays visible */
              }
            }}
          >
            <span aria-live="polite">{copied ? t.numberCopied : t.copyNumber}</span>
          </button>
        </div>
      )}
      {department && (
        <div className={styles.followUp}>
          <p>{t.quoteFollowUp.replace("{department}", lp(department.name, locale))}</p>
          <ul>
            {department.phones[0] && (
              <li>
                <span>{t.mainLine}</span>
                <a href={telHref(department.phones[0])} dir="ltr">
                  {department.phones[0]}
                </a>
              </li>
            )}
            {department.people.slice(0, 4).map((m) => (
              <li key={lp(m.name, "fa")}>
                <span>
                  {lp(m.name, locale)} · {lp(m.role, locale)}
                </span>
                <span className={styles.reach}>
                  {m.exts.length > 0 && (
                    <span>
                      {t.extShort} <span dir="ltr">{m.exts.join(" · ")}</span>
                    </span>
                  )}
                  {(m.mobiles ?? []).slice(0, 1).map((n) => (
                    <a key={n} href={telHref(n)} dir="ltr" aria-label={`${t.mobileShort} ${lp(m.name, locale)}: ${n}`}>
                      {n}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* The confirmation email only goes out when the visitor gave an address. */}
      {typeof sent.email === "string" && sent.email.trim() && <p className={styles.submitHint}>{t.quoteEmailNote}</p>}
      <button type="button" className="btn btn--ghost" onClick={reset}>
        <RollText text={t.newRequest} />
      </button>
    </div>
  );

  return (
    <section id="quote" className={styles.quote} aria-labelledby={`${id}-title`}>
      <div className={styles.quoteIntro}>
        <h2 id={`${id}-title`} className={styles.title}>
          {t.quoteTitle}
        </h2>
        <p className={styles.lead}>{t.quoteLead}</p>
        <div className={styles.quoteSpec}>
          <p className={styles.fieldTitle}>{t.quoteConfig}</p>
          <ul>
            {spec.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.quoteForm}>
        <LazyOpexForm
          form={form}
          t={forms}
          locale={locale}
          page={typeof location === "undefined" ? `/${locale}` : location.pathname}
          values={values}
          context={{ subject: t.subject.replace("{spec}", subjectSpec), spec: [...spec, typeof location === "undefined" ? "" : `${location.origin}${location.pathname}?${search}`].filter(Boolean) }}
          success={success}
          onFallback={(v) => {
            const link = `${location.origin}${location.pathname}?${search}`;
            const rows = form.fields
              .filter((f) => f.type !== "hidden" && f.type !== "file" && v[f.id] !== undefined && v[f.id] !== "")
              .map((f): [string, string] => [lp(f.label as Record<string, string>, locale), String(v[f.id])]);
            location.href = quoteMailto({ to: email, subject: t.subject.replace("{spec}", subjectSpec), spec, fields: rows, link: `${t.linkLabel}: ${link}` });
          }}
        />
      </div>
    </section>
  );
}
