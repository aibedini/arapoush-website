"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_INFO, LOCALES, type Locale, type TranslateMode } from "@arapoush/schema";
import { Translate } from "@phosphor-icons/react";
import { api, type ApiError } from "@/lib/api";
import { num } from "@/lib/fa";
import { Dialog, ErrorNote } from "./ui";

/** The languages and the way to fill them, shared by every AI translation control. */
export type TranslateOptions = { from: Locale; to: Locale[]; mode: TranslateMode; note: string };
export const defaultOptions = (from: Locale = DEFAULT_LOCALE): TranslateOptions => ({ from, to: LOCALES.filter((l) => l !== from), mode: "missing", note: "" });

/** What to translate: a page (optionally one part of it), a blog post, or the blog lists. */
export type TranslateTarget = { kind: "entry"; type: string; scope?: string } | { kind: "post"; id: string } | { kind: "taxonomy" };
export type TranslateResult = { segments: number; written: number; perLocale: Record<string, number> };

export const targetUrl = (t: TranslateTarget) =>
  t.kind === "entry" ? `/v1/manage/translate/entries/${encodeURIComponent(t.type)}` : t.kind === "post" ? `/v1/manage/translate/blog/${encodeURIComponent(t.id)}` : "/v1/manage/translate/blog-taxonomy";

/** Runs one translation (or counts it with `dryRun`). */
export function runTranslate(t: TranslateTarget, o: TranslateOptions, dryRun = false) {
  const body: Record<string, unknown> = { from: o.from, to: o.to, mode: o.mode, dryRun, ...(o.note.trim() ? { note: o.note.trim() } : {}) };
  if (t.kind === "entry" && t.scope) body.scope = t.scope;
  return api<TranslateResult>(targetUrl(t), { body });
}

export const localeName = (l: Locale) => LOCALE_INFO[l].native;

/** Source, targets (multi-select), mode and an optional note. */
export function TranslateFields({ value, onChange, disabled }: { value: TranslateOptions; onChange: (v: TranslateOptions) => void; disabled?: boolean }) {
  const setFrom = (from: Locale) => onChange({ ...value, from, to: value.to.filter((l) => l !== from).length ? value.to.filter((l) => l !== from) : LOCALES.filter((l) => l !== from) });
  const toggle = (l: Locale, on: boolean) => onChange({ ...value, to: on ? LOCALES.filter((x) => x === l || value.to.includes(x)) : value.to.filter((x) => x !== l) });
  return (
    <fieldset disabled={disabled} className="stack">
      <legend className="sr-only">زبان‌ها و روش ترجمه</legend>
      <div className="filters">
        <label className="f">
          <span>زبان مبدأ</span>
          <select value={value.from} onChange={(e) => setFrom(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {localeName(l)}
              </option>
            ))}
          </select>
        </label>
        <div className="f" role="group" aria-label="زبان‌های مقصد" style={{ display: "grid", gap: 4 }}>
          <span className="small muted" style={{ fontWeight: 500 }}>
            ترجمه به
          </span>
          <div className="row">
            {LOCALES.filter((l) => l !== value.from).map((l) => (
              <label key={l} className="check">
                <input type="checkbox" checked={value.to.includes(l)} onChange={(e) => toggle(l, e.target.checked)} />
                <span>{localeName(l)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="row" role="radiogroup" aria-label="چه چیزی ترجمه شود">
        <label className="check">
          <input type="radio" name="tr-mode" checked={value.mode === "missing"} onChange={() => onChange({ ...value, mode: "missing" })} />
          <span>فقط جاهای خالی</span>
        </label>
        <label className="check">
          <input type="radio" name="tr-mode" checked={value.mode === "all"} onChange={() => onChange({ ...value, mode: "all" })} />
          <span>همه را دوباره ترجمه کن (متن فعلی زبان‌های مقصد جایگزین می‌شود)</span>
        </label>
      </div>
      <label className="f">
        <span>توضیح برای مترجم (اختیاری)</span>
        <input value={value.note} maxLength={500} placeholder="مثلاً: لحن رسمی؛ «آراپوش» را Arapoush بنویس" onChange={(e) => onChange({ ...value, note: e.target.value })} />
      </label>
    </fieldset>
  );
}

/**
 * A button that opens the translate dialog for one target. The result is saved as a draft on the
 * server; `onDone` reloads the page's data. `beforeRun` lets an editor save pending edits first.
 */
export function AiTranslateButton({ target, label = "ترجمه با هوش مصنوعی", title, onDone, beforeRun, small, disabled }: { target: TranslateTarget; label?: string; title?: string; onDone?: (r: TranslateResult) => void; beforeRun?: () => Promise<unknown>; small?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn${small ? " sm" : ""}`} disabled={disabled} onClick={() => setOpen(true)}>
        <Translate size={small ? 14 : 16} aria-hidden /> {label}
      </button>
      {open && <AiTranslateDialog target={target} title={title ?? label} onClose={() => setOpen(false)} onDone={onDone} beforeRun={beforeRun} />}
    </>
  );
}

export function AiTranslateDialog({ target, title, onClose, onDone, beforeRun }: { target: TranslateTarget; title: string; onClose: () => void; onDone?: (r: TranslateResult) => void; beforeRun?: () => Promise<unknown> }) {
  const [o, setO] = useState<TranslateOptions>(defaultOptions);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<TranslateResult | null>(null);

  // How many values the choice would translate (no AI call).
  useEffect(() => {
    if (!o.to.length) return setCount(0);
    let live = true;
    setCount(null);
    runTranslate(target, o, true)
      .then((r) => live && setCount(r.segments))
      .catch((e: ApiError) => live && setError(e));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the note does not change the count
  }, [o.from, o.to.join(), o.mode, JSON.stringify(target)]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (beforeRun) await beforeRun();
      const r = await runTranslate(target, o);
      setDone(r);
      onDone?.(r);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="btn primary" onClick={onClose}>
            بستن
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={onClose}>
              انصراف
            </button>
            <button type="button" className="btn primary" disabled={busy || !o.to.length || count === 0} onClick={run}>
              {busy ? "در حال ترجمه…" : "ترجمه کن"}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="note ok" role="status">
          {done.written ? (
            <>
              {num(done.written)} متن ترجمه و در پیش‌نویس ذخیره شد ({Object.entries(done.perLocale).map(([l, n]) => `${localeName(l as Locale)}: ${num(n)}`).join("، ")}). بخوانید و اگر درست بود منتشر کنید.
            </>
          ) : (
            "چیزی برای ترجمه نبود."
          )}
        </div>
      ) : (
        <>
          <TranslateFields value={o} onChange={setO} disabled={busy} />
          <p className="small muted" role="status" aria-live="polite">
            {count === null ? "در حال شمارش…" : count === 0 ? "در این انتخاب چیزی برای ترجمه نیست." : `${num(count)} متن ترجمه می‌شود. نتیجه پیش‌نویس است و تا انتشار روی سایت نمی‌رود.`}
          </p>
        </>
      )}
      <ErrorNote error={error} />
    </Dialog>
  );
}
