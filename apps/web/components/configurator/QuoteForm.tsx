"use client";

import { useId, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { EMPTY_QUOTE, quoteMailto, validateQuote, type QuoteErrors, type QuoteForm as Form } from "@/lib/configurator/quote";
import RollText from "@/components/ui/RollText";
import Honeypot from "@/components/ui/Honeypot";
import { sendInquiry } from "@/lib/forms";
import styles from "./Configurator.module.css";

type Props = {
  t: Dictionary["productTube"]["configurator"];
  spec: string[];
  subjectSpec: string;
  search: string;
  email: string;
  locale: string;
  /** OPEX is set up: the request is sent directly (the email app is only the fallback). */
  direct?: boolean;
};

/**
 * Quote request pre-filled with the configuration. With OPEX it is sent straight to sales (stored
 * encrypted, emailed); otherwise, or if sending fails, it opens the visitor's email app with a
 * complete message addressed to the sales inbox.
 */
export default function QuoteForm({ t, spec, subjectSpec, search, email, locale, direct }: Props) {
  const id = useId();
  const [form, setForm] = useState<Form>(EMPTY_QUOTE);
  const [errors, setErrors] = useState<QuoteErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [trap, setTrap] = useState("");
  const [shownAt] = useState(() => Date.now());

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
        onSubmit={async (e) => {
          e.preventDefault();
          if (status === "sending") return;
          const errs = validateQuote(form);
          setErrors(errs);
          const first = Object.keys(errs)[0];
          if (first) {
            document.getElementById(`${id}-${first}`)?.focus();
            return;
          }
          const subject = t.subject.replace("{spec}", subjectSpec);
          const link = `${location.origin}${location.pathname}?${search}`;
          const mail = () =>
            (location.href = quoteMailto({ to: email, subject, spec, fields: fields.map((f) => [f.label, form[f.key]]), link: `${t.linkLabel}: ${link}` }));
          if (!direct) return mail();
          setStatus("sending");
          const r = await sendInquiry(
            "quote",
            { locale, page: location.pathname, subject, spec: [...spec, link], fields: { name: form.name, email: form.email, company: form.company, phone: form.phone, quantity: form.quantity, message: form.message } },
            { website: trap, shownAt },
          );
          if (r === "sent") {
            setStatus("sent");
            setForm(EMPTY_QUOTE);
            return;
          }
          setStatus("idle");
          mail();
        }}
      >
        <Honeypot value={trap} onChange={setTrap} />
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
          <button type="submit" className="btn" disabled={status === "sending"} aria-busy={status === "sending"}>
            <RollText text={status === "sending" ? t.sending : direct ? t.submitDirect : t.submit} />
          </button>
          <p className={styles.submitHint} role={status === "sent" ? "status" : undefined}>
            {status === "sent" ? (
              <>
                <strong>{t.sent}</strong> {t.sentLead}
              </>
            ) : (
              (direct ? t.directHint : t.submitHint).replace("{email}", email)
            )}
          </p>
        </div>
      </form>
    </section>
  );
}
