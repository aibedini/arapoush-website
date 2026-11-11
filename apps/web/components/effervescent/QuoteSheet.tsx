"use client";

import { useEffect, useId, useRef, useState } from "react";
import RollText from "@/components/ui/RollText";
import type { Dictionary } from "@/lib/i18n";
import { quoteMailto } from "@/lib/configurator/quote";
import Honeypot from "@/components/ui/Honeypot";
import { sendInquiry } from "@/lib/forms";
import styles from "./Effervescent.module.css";

type T = Dictionary["productEff"]["sizes"]["form"];
type Fields = { first: string; last: string; mobile: string; email: string; message: string };
type Errors = Partial<Record<keyof Fields, string>>;

const EMPTY: Fields = { first: "", last: "", mobile: "", email: "", message: "" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Persian/Arabic digits are accepted and normalised; 8 to 15 digits with an optional leading +.
const toLatin = (s: string) => s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
const MOBILE = /^\+?\d{8,15}$/;

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

type Props = { t: T; size: string; unit: string; email: string; open: boolean; origin: { x: number; y: number } | null; onClose: () => void; locale: string; direct?: boolean };

/**
 * Quote request that unfolds from the button that opened it (clip-path circle from the click point,
 * then the fields rise in sequence). With OPEX it is sent straight to sales; otherwise, or if sending
 * fails, it opens the visitor's email app with a complete message, like the configurator's form.
 */
export default function QuoteSheet({ t, size, unit, email, open, origin, onClose, locale, direct }: Props) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [trap, setTrap] = useState("");
  const [shownAt, setShownAt] = useState(() => Date.now());
  useEffect(() => {
    if (open) {
      setShownAt(Date.now());
      setStatus("idle");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = panel.current!;
    const focus = setTimeout(() => el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 260);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focus);
      removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const validate = (f: Fields): Errors => {
    const e: Errors = {};
    if (!f.first.trim()) e.first = t.required;
    if (!f.last.trim()) e.last = t.required;
    const m = toLatin(f.mobile).replace(/[\s()-]/g, "");
    if (!m) e.mobile = t.required;
    else if (!MOBILE.test(m)) e.mobile = t.invalidMobile;
    if (!f.email.trim()) e.email = t.required;
    else if (!EMAIL.test(f.email.trim())) e.email = t.invalidEmail;
    return e;
  };

  const fields: { key: keyof Fields; label: string; type?: string; auto?: string; area?: boolean; half?: boolean; dir?: "ltr" }[] = [
    { key: "first", label: t.first, auto: "given-name", half: true },
    { key: "last", label: t.last, auto: "family-name", half: true },
    { key: "mobile", label: t.mobile, type: "tel", auto: "tel", half: true, dir: "ltr" },
    { key: "email", label: t.email, type: "email", auto: "email", half: true, dir: "ltr" },
    { key: "message", label: t.message, area: true },
  ];

  return (
    <div
      ref={panel}
      className={styles.sheet}
      data-open={open || undefined}
      style={origin ? ({ "--ox": `${origin.x}px`, "--oy": `${origin.y}px` } as React.CSSProperties) : undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-t`}
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div className={styles.sheetHead}>
        <div>
          <h3 id={`${id}-t`}>{t.title}</h3>
          <p className={styles.sheetSize}>
            <span className="ltr">{size}</span> {unit}
          </p>
        </div>
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label={t.close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <p className={styles.sheetLead}>{t.lead}</p>
      <form
        className={styles.sheetForm}
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (status === "sending") return;
          const errs = validate(form);
          setErrors(errs);
          const first = Object.keys(errs)[0];
          if (first) {
            panel.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
            return;
          }
          const subject = fill(t.subject, { size: `${size} ${unit}` });
          const link = location.href.split("#")[0]! + "#sizes";
          const mail = () =>
            (location.href = quoteMailto({ to: email, subject, spec: [`${size} ${unit}`], fields: fields.map((f) => [f.label, f.key === "mobile" ? toLatin(form.mobile) : form[f.key]]), link }));
          if (!direct) return mail();
          setStatus("sending");
          const r = await sendInquiry(
            "quote",
            { locale, page: location.pathname, subject, spec: [`${size} ${unit}`, link], fields: { name: `${form.first.trim()} ${form.last.trim()}`, email: form.email, mobile: toLatin(form.mobile), message: form.message } },
            { website: trap, shownAt },
          );
          if (r === "sent") {
            setStatus("sent");
            setForm(EMPTY);
            return;
          }
          setStatus("idle");
          mail();
        }}
      >
        <Honeypot value={trap} onChange={setTrap} />
        {fields.map((f, i) => {
          const err = errors[f.key];
          const props = {
            id: `${id}-${f.key}`,
            name: f.key,
            value: form[f.key],
            autoComplete: f.auto,
            dir: f.dir,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? `${id}-${f.key}-e` : f.area ? `${id}-${f.key}-h` : undefined,
            required: !f.area,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              setForm({ ...form, [f.key]: e.target.value });
              if (err) setErrors({ ...errors, [f.key]: undefined });
            },
          };
          return (
            <div key={f.key} className={`${styles.sheetField} ${f.half ? styles.half : ""}`} style={{ "--i": i } as React.CSSProperties}>
              <label htmlFor={props.id}>{f.label}</label>
              {f.area ? <textarea rows={3} {...props} /> : <input type={f.type ?? "text"} inputMode={f.type === "tel" ? "tel" : undefined} {...props} />}
              {f.area && !err && (
                <span id={`${id}-${f.key}-h`} className={styles.sheetHelp}>
                  {t.messageHint}
                </span>
              )}
              {err && (
                <span id={`${id}-${f.key}-e`} className={styles.sheetError} role="alert">
                  {err}
                </span>
              )}
            </div>
          );
        })}
        <div className={styles.sheetActions} style={{ "--i": fields.length } as React.CSSProperties}>
          <button type="submit" className="btn" disabled={status === "sending"} aria-busy={status === "sending"}>
            <RollText text={status === "sending" ? t.sending : t.send} />
          </button>
          <p className={styles.sheetHelp} role={status === "sent" ? "status" : undefined}>
            {status === "sent" ? (
              <>
                <strong>{t.sent}</strong> {t.sentLead}
              </>
            ) : (
              fill(direct ? t.directHint : t.hint, { email })
            )}
          </p>
        </div>
      </form>
    </div>
  );
}
