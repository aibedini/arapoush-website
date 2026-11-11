"use client";

import { useId, useMemo, useRef, useState } from "react";
import { isVisible, pickL, validateSubmission, type FormField } from "@arapoush/schema";
import type { Dictionary } from "@/lib/i18n";
import { sendForm, type PublicForm } from "@/lib/forms";
import Honeypot from "@/components/ui/Honeypot";
import RollText from "@/components/ui/RollText";
import styles from "./OpexForm.module.css";

const MAX_MB = 10;
const ACCEPT: Record<string, string> = { pdf: "application/pdf,.pdf", jpeg: "image/jpeg,.jpg,.jpeg", png: "image/png,.png", webp: "image/webp,.webp" };
const AUTO: Partial<Record<string, string>> = { name: "name", email: "email", phone: "tel", company: "organization" };

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/**
 * A form built in OPEX (P11), rendered from its published definition. Conditions and validation use
 * the same code as OPEX (`@arapoush/schema`), so what passes here passes there. Every submission
 * becomes a ticket in the OPEX helpdesk.
 */
export default function OpexForm({ form, t, locale, page, headingLevel = 2 }: { form: PublicForm; t: Dictionary["forms"]; locale: string; page: string; headingLevel?: 1 | 2 }) {
  const uid = useId();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");
  const [number, setNumber] = useState<number | null>(null);
  const [trap, setTrap] = useState("");
  const [shownAt] = useState(() => Date.now());
  const summary = useRef<HTMLParagraphElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const L = (l: Parameters<typeof pickL>[0]) => pickL(l, locale);
  const H = headingLevel === 1 ? "h1" : "h2";

  // Hidden fields: fixed values, or {page} / {utm_*} from the address.
  const hidden = useMemo(() => {
    const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    return Object.fromEntries(
      form.fields
        .filter((f) => f.type === "hidden")
        .map((f) => [f.id, (f.defaultValue ?? "").replace(/\{(page|utm_[a-z]+)\}/g, (_, k: string) => (k === "page" ? page : (q.get(k) ?? "").slice(0, 120)))])
        .filter(([, v]) => v),
    );
  }, [form.fields, page]);

  const set = (id: string, v: unknown) => {
    setValues((s) => ({ ...s, [id]: v }));
    if (errors[id]) setErrors(({ [id]: _, ...rest }) => rest);
  };
  const all = { ...values, ...hidden };
  const shown = form.fields.filter((f) => f.type !== "hidden" && isVisible(f, all));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = Object.fromEntries(Object.entries(all).filter(([k, v]) => v !== undefined && v !== "" && form.fields.find((f) => f.id === k)?.type !== "file"));
    const counts = Object.fromEntries(Object.entries(files).filter(([, l]) => l.length).map(([k, l]) => [k, l.length]));
    const local = validateSubmission(form, input, counts);
    const tooBig = Object.entries(files).find(([, l]) => l.some((f) => f.size > MAX_MB * 1048576));
    if (tooBig) local.errors[tooBig[0]] = "bad_file";
    if (Object.keys(local.errors).length) {
      setErrors(local.errors);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setStatus("sending");
    const payloadFiles = (await Promise.all(Object.entries(files).flatMap(([field, list]) => list.map(async (f) => ({ field, name: f.name, data: await toBase64(f) })))));
    const r = await sendForm(form.slug, { locale, page, values: input, files: payloadFiles.length ? payloadFiles : undefined }, { website: trap, shownAt });
    if (r.result === "sent") {
      setNumber(r.number ?? null);
      setStatus("sent");
      requestAnimationFrame(() => done.current?.focus());
    } else if (r.result === "invalid") {
      setErrors(Object.fromEntries((r.issues ?? []).map((i) => [i.path, i.message])));
      setStatus("idle");
      requestAnimationFrame(() => summary.current?.focus());
    } else setStatus(r.result === "limited" ? "limited" : "failed");
  };

  if (status === "sent")
    return (
      <div ref={done} tabIndex={-1} className={styles.done} role="status">
        <H className={styles.title}>{t.sentTitle}</H>
        <p className={styles.lead}>{L(form.success)}</p>
        {number && (
          <p className={styles.ref}>
            {t.reference}: <span className="ltr">#{number}</span>
          </p>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => (setValues({}), setFiles({}), setStatus("idle"))}>
          <RollText text={t.another} />
        </button>
      </div>
    );

  const errMsg = (code: string) => (t.errors as Record<string, string>)[code] ?? t.errors.invalid_option;
  const errorCount = Object.keys(errors).length;

  const control = (f: FormField, id: string, invalid: boolean, describedBy: string | undefined) => {
    const common = { id, name: f.id, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, "aria-required": f.required || undefined };
    const v = values[f.id];
    switch (f.type) {
      case "textarea":
        return <textarea {...common} rows={5} maxLength={f.max ?? 5000} placeholder={L(f.placeholder) || undefined} value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)} />;
      case "select":
        return (
          <select {...common} value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)}>
            <option value="">{t.choose}</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {L(o.label)}
              </option>
            ))}
          </select>
        );
      case "radio":
      case "checkboxes":
        return (
          <div className={styles.options}>
            {f.options?.map((o) => {
              const on = f.type === "radio" ? v === o.value : Array.isArray(v) && v.includes(o.value);
              return (
                <label key={o.value} className={styles.option}>
                  <input
                    type={f.type === "radio" ? "radio" : "checkbox"}
                    name={`${uid}-${f.id}`}
                    checked={on}
                    aria-invalid={invalid || undefined}
                    onChange={() => set(f.id, f.type === "radio" ? o.value : on ? (v as string[]).filter((x) => x !== o.value) : [...((v as string[]) ?? []), o.value])}
                  />
                  <span>{L(o.label)}</span>
                </label>
              );
            })}
          </div>
        );
      case "file":
        return (
          <input
            {...common}
            type="file"
            multiple={(f.max ?? 1) > 1}
            accept={(f.accept ?? ["pdf", "jpeg", "png", "webp"]).map((k) => ACCEPT[k]).join(",")}
            onChange={(e) => {
              setFiles((s) => ({ ...s, [f.id]: Array.from(e.target.files ?? []) }));
              if (errors[f.id]) setErrors(({ [f.id]: _, ...rest }) => rest);
            }}
          />
        );
      default: {
        const type = f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text";
        return (
          <input
            {...common}
            type={type}
            inputMode={f.type === "number" ? "decimal" : f.type === "phone" ? "tel" : undefined}
            dir={f.type === "email" || f.type === "phone" ? "ltr" : undefined}
            autoComplete={f.role ? AUTO[f.role] : undefined}
            maxLength={f.type === "text" ? (f.max ?? 300) : undefined}
            placeholder={L(f.placeholder) || undefined}
            value={String(v ?? "")}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
      }
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-describedby={errorCount ? `${uid}-sum` : undefined}>
      <Honeypot value={trap} onChange={setTrap} />
      <p ref={summary} id={`${uid}-sum`} tabIndex={-1} className={styles.summary} role={errorCount ? "alert" : undefined} hidden={!errorCount}>
        {t.fix}
      </p>
      <div className={styles.grid}>
        {shown.map((f) => {
          const id = `${uid}-${f.id}`;
          if (f.type === "heading")
            return (
              <h3 key={f.id} className={`${styles.wide} ${styles.section}`}>
                {L(f.label)}
              </h3>
            );
          if (f.type === "paragraph")
            return (
              <p key={f.id} className={`${styles.wide} ${styles.note}`}>
                {L(f.label)}
              </p>
            );
          const err = errors[f.id];
          const help = L(f.help) || (f.type === "file" ? t.fileHint.replace("{size}", String(MAX_MB)) : "");
          const describedBy = [help && `${id}-h`, err && `${id}-e`].filter(Boolean).join(" ") || undefined;
          const group = f.type === "radio" || f.type === "checkboxes";
          if (f.type === "checkbox" || f.type === "consent")
            return (
              <div key={f.id} className={`${styles.field} ${styles.wide}`}>
                <label className={styles.option}>
                  <input type="checkbox" id={id} checked={values[f.id] === true} aria-invalid={!!err || undefined} aria-describedby={describedBy} onChange={(e) => set(f.id, e.target.checked)} />
                  <span>
                    {L(f.label)}
                    {f.required !== false && f.type === "consent" ? <span className={styles.req} aria-hidden> *</span> : f.required ? <span className={styles.req} aria-hidden> *</span> : null}
                  </span>
                </label>
                {help && <span id={`${id}-h`} className={styles.help}>{help}</span>}
                {err && <span id={`${id}-e`} className={styles.error}>{errMsg(err)}</span>}
              </div>
            );
          const Wrap = group ? "fieldset" : "div";
          return (
            <Wrap key={f.id} className={`${styles.field} ${f.width === "half" ? "" : styles.wide}`} aria-describedby={group ? describedBy : undefined}>
              {group ? (
                <legend className={styles.label}>
                  {L(f.label)}
                  {f.required ? <span className={styles.req} aria-hidden> *</span> : <span className={styles.opt}> ({t.optional})</span>}
                </legend>
              ) : (
                <label htmlFor={id} className={styles.label}>
                  {L(f.label)}
                  {f.required ? <span className={styles.req} aria-hidden> *</span> : <span className={styles.opt}> ({t.optional})</span>}
                </label>
              )}
              {control(f, id, !!err, describedBy)}
              {help && <span id={`${id}-h`} className={styles.help}>{help}</span>}
              {err && <span id={`${id}-e`} className={styles.error}>{errMsg(err)}</span>}
            </Wrap>
          );
        })}
      </div>
      {(status === "failed" || status === "limited") && (
        <p className={styles.error} role="alert">
          {status === "limited" ? t.limited : t.failed}
        </p>
      )}
      <div className={styles.submit}>
        <button className="btn" disabled={status === "sending"} aria-busy={status === "sending" || undefined}>
          <RollText text={status === "sending" ? t.sending : L(form.submitLabel)} />
        </button>
      </div>
    </form>
  );
}
