"use client";

import { useId, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { EMPTY_QUOTE, quoteMailto, validateQuote, type QuoteErrors, type QuoteForm as Form } from "@/lib/configurator/quote";
import RollText from "@/components/ui/RollText";
import styles from "./Configurator.module.css";

type Props = {
  t: Dictionary["productTube"]["configurator"];
  spec: string[];
  subjectSpec: string;
  search: string;
  email: string;
};

/**
 * Quote request pre-filled with the configuration. There is no mail backend yet, so it hands a
 * complete message to the visitor's email app, addressed to the sales inbox.
 */
export default function QuoteForm({ t, spec, subjectSpec, search, email }: Props) {
  const id = useId();
  const [form, setForm] = useState<Form>(EMPTY_QUOTE);
  const [errors, setErrors] = useState<QuoteErrors>({});

  const fields: {
    key: keyof Form;
    label: string;
    type?: string;
    auto?: string;
    optional?: boolean;
    wide?: boolean;
    area?: boolean;
  }[] = [
    { key: "name", label: t.name, auto: "name" },
    { key: "company", label: t.company, auto: "organization", optional: true },
    { key: "email", label: t.email, type: "email", auto: "email" },
    { key: "phone", label: t.phone, type: "tel", auto: "tel", optional: true },
    { key: "quantity", label: t.quantity, optional: true, wide: true },
    {
      key: "message",
      label: t.message,
      optional: true,
      wide: true,
      area: true,
    },
  ];
  const errorText = (k: keyof Form) => {
    const e = errors[k];
    if (!e) return null;
    if (e === "required") return t.required;
    return k === "email" ? t.invalidEmail : t.invalidQuantity;
  };

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

      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const errs = validateQuote(form);
          setErrors(errs);
          const first = Object.keys(errs)[0];
          if (first) {
            document.getElementById(`${id}-${first}`)?.focus();
            return;
          }
          location.href = quoteMailto({
            to: email,
            subject: t.subject.replace("{spec}", subjectSpec),
            spec,
            fields: fields.map((f) => [f.label, form[f.key]]),
            link: `${t.linkLabel}: ${location.origin}${location.pathname}?${search}`,
          });
        }}
      >
        {fields.map((f) => {
          const err = errorText(f.key);
          const props = {
            id: `${id}-${f.key}`,
            name: f.key,
            value: form[f.key],
            autoComplete: f.auto,
            required: !f.optional,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? `${id}-${f.key}-err` : undefined,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [f.key]: e.target.value }),
          };
          return (
            <div key={f.key} className={`${styles.input} ${f.wide ? styles.wide : ""}`}>
              <label htmlFor={props.id}>
                {f.label}
                {f.optional && <span> ({t.optional})</span>}
              </label>
              {f.area ? (
                <textarea rows={3} {...props} />
              ) : (
                <input type={f.type ?? "text"} dir={f.type === "email" || f.type === "tel" ? "ltr" : undefined} {...props} />
              )}
              {err && (
                <span id={`${id}-${f.key}-err`} className={styles.error}>
                  {err}
                </span>
              )}
            </div>
          );
        })}
        <div className={`${styles.wide} ${styles.submitRow}`}>
          <button type="submit" className="btn">
            <RollText text={t.submit} />
          </button>
          <p className={styles.submitHint}>{t.submitHint.replace("{email}", email)}</p>
        </div>
      </form>
    </section>
  );
}
