"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ImageSquare, MagnifyingGlass, Plus, Trash, Warning, X } from "@phosphor-icons/react";
import { previewSrc } from "@/lib/api";
import { LOCALE_LABEL, num } from "@/lib/fa";
import { Dialog } from "@/components/ui";
import { MediaLibrary, assetUrl } from "@/components/MediaLibrary";
import { HEX_RE, ID_RE, type Loc } from "./model";

const LOCALES = ["fa", "en", "tr"] as const;

/** Name in the three site languages; a missing translation is flagged next to its input. */
export function LocFields({ legend, value, onChange, multiline, disabled }: { legend: string; value: Loc | undefined; onChange: (v: Loc) => void; multiline?: boolean; disabled?: boolean }) {
  const v = value ?? {};
  const some = LOCALES.some((l) => v[l]);
  return (
    <fieldset className="cm-loc">
      <legend>{legend}</legend>
      <div className="locs">
        {LOCALES.map((l) => {
          const props = {
            value: v[l] ?? "",
            dir: l === "fa" ? "rtl" : "ltr",
            lang: l,
            disabled,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...v, [l]: e.target.value }),
          } as const;
          return (
            <label key={l} className="loc">
              <span>
                {LOCALE_LABEL[l]}
                {some && !v[l] && <span className="badge warn" style={{ marginInlineStart: 6 }}>ترجمه نشده</span>}
              </span>
              {multiline ? <textarea rows={2} {...props} /> : <input {...props} />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Stable id (used in links and saved quotes). Edits apply on Enter or leaving the field; a duplicate
 * or malformed id is refused there, so references are renamed once, to a valid id.
 */
export function IdField({ value, taken, onCommit, label = "شناسه", disabled }: { value: string; taken: string[]; onCommit: (v: string) => void; label?: string; disabled?: boolean }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = draft === value ? "" : !ID_RE.test(draft) ? "فقط حروف و عدد انگلیسی و خط تیره؛ با حرف شروع شود." : taken.includes(draft) ? "این شناسه را مورد دیگری دارد." : "";
  const commit = () => {
    if (draft === value) return;
    if (error) setDraft(value);
    else onCommit(draft);
  };
  return (
    <div className="f cm-id">
      <label htmlFor={`${id}-i`}>{label}</label>
      <input
        id={`${id}-i`}
        dir="ltr"
        className="mono"
        value={draft}
        disabled={disabled}
        aria-invalid={!!error || undefined}
        aria-describedby={`${id}-h`}
        onChange={(e) => setDraft(e.target.value.trim())}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(value);
        }}
      />
      <small id={`${id}-h`} className={error ? "pf-err" : "small muted"}>
        {error || "در پیوندها و درخواست‌های قیمت ذخیره می‌شود؛ تغییرش همهٔ ارجاع‌ها را هم عوض می‌کند."}
      </small>
    </div>
  );
}

/** An image path from the media library, with a thumbnail. */
export function ImagePick({ label, value, onChange, disabled }: { label: string; value: string | undefined; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cm-img">
      <span className="cm-k">{label}</span>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
        {value ? <img className="thumb" src={previewSrc(value)} alt="" /> : <div className="thumb cm-thumb-empty" aria-hidden="true"><ImageSquare size={22} /></div>}
        <div className="stack" style={{ gap: 4, minInlineSize: 0 }}>
          <code className="small cm-ellipsis">{value || "بدون تصویر"}</code>
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn sm" disabled={disabled} onClick={() => setOpen(true)}>
              انتخاب از رسانه
            </button>
            {value && (
              <button type="button" className="btn sm ghost" disabled={disabled} onClick={() => onChange("")} aria-label={`حذف ${label}`}>
                حذف
              </button>
            )}
          </div>
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={`انتخاب ${label}`} wide>
        <MediaLibrary
          accept="image/*,.svg"
          onPick={(a) => {
            setOpen(false);
            onChange(assetUrl(a));
          }}
        />
      </Dialog>
    </div>
  );
}

/** Colour picker plus the hex code, kept in step. */
export function HexInput({ label, value, onChange, disabled, compact }: { label: string; value: string | undefined; onChange: (v: string) => void; disabled?: boolean; compact?: boolean }) {
  const v = value ?? "";
  const ok = HEX_RE.test(v);
  return (
    <div className={`cm-hex${compact ? " compact" : ""}`}>
      {!compact && <span className="cm-k">{label}</span>}
      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
        <input type="color" aria-label={`${label}: انتخاب رنگ`} value={ok ? v : "#000000"} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        <input dir="ltr" className="mono" aria-label={`${label}: کد رنگ`} value={v} disabled={disabled} aria-invalid={(!!v && !ok) || undefined} onChange={(e) => onChange(e.target.value.trim())} placeholder="#000000" />
      </div>
    </div>
  );
}

/** Free-text chips (Excel wordings, hex swatches): Enter adds, the × removes. */
export function ChipList({ label, values, onChange, placeholder, ltr, disabled, swatch }: { label: string; values: string[] | undefined; onChange: (v: string[]) => void; placeholder?: string; ltr?: boolean; disabled?: boolean; swatch?: boolean }) {
  const [text, setText] = useState("");
  const list = values ?? [];
  const add = () => {
    const t = text.trim();
    if (t && !list.includes(t)) onChange([...list, t]);
    setText("");
  };
  return (
    <fieldset className="cm-chips">
      <legend>{label}</legend>
      <ul className="cm-chip-list">
        {list.map((v) => (
          <li key={v} className="cm-chip" dir={ltr ? "ltr" : undefined}>
            {swatch && <span className="cm-dot" style={{ background: HEX_RE.test(v) ? v : "transparent" }} aria-hidden="true" />}
            <span>{v}</span>
            <button type="button" disabled={disabled} onClick={() => onChange(list.filter((x) => x !== v))} aria-label={`حذف ${v}`}>
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
        <li className="cm-chip-add">
          <input
            dir={ltr ? "ltr" : "auto"}
            value={text}
            disabled={disabled}
            aria-label={`افزودن به ${label}`}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn sm" disabled={disabled || !text.trim()} onClick={add}>
            افزودن
          </button>
        </li>
      </ul>
    </fieldset>
  );
}

/** Multi-select as toggle chips; nothing selected means "all", said in the legend. */
export function CheckChips<T extends string | number>({ legend, options, value, onChange, hint, disabled }: { legend: string; options: { id: T; label: string }[]; value: T[] | undefined; onChange: (v: T[] | undefined) => void; hint?: string; disabled?: boolean }) {
  const sel = value ?? [];
  return (
    <fieldset className="cm-chips">
      <legend>
        {legend} {hint && <span className="small muted">({sel.length ? `${num(sel.length)} انتخاب` : hint})</span>}
      </legend>
      <div className="cm-toggles">
        {options.map((o) => {
          const on = sel.includes(o.id);
          return (
            <label key={String(o.id)} className="cm-toggle" data-on={on}>
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => {
                  const next = on ? sel.filter((x) => x !== o.id) : [...sel, o.id];
                  onChange(next.length ? next : undefined);
                }}
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export type MasterItem = { id: string; title: string; sub?: string; swatch?: string; image?: string; issues?: number; badge?: React.ReactNode };

/**
 * The list half of a list/detail editor: search, the items in catalogue order (that order is the
 * website's order), and add. Selection is a pressed button, so the list stays a plain tab stop list.
 */
export function MasterList({ label, items, selected, onSelect, onAdd, addLabel, disabled }: { label: string; items: MasterItem[]; selected: string; onSelect: (id: string) => void; onAdd?: () => void; addLabel?: string; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const shown = s ? items.filter((i) => `${i.id} ${i.title} ${i.sub ?? ""}`.toLowerCase().includes(s)) : items;
  return (
    <section className="cm-master card" aria-label={label}>
      <div className="cm-master-head">
        <div className="search">
          <MagnifyingGlass size={16} aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو" aria-label={`جستجو در ${label}`} />
        </div>
        {onAdd && (
          <button type="button" className="btn sm primary" onClick={onAdd} disabled={disabled}>
            <Plus size={14} aria-hidden /> {addLabel ?? "افزودن"}
          </button>
        )}
      </div>
      <ul className="cm-master-list">
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" className="cm-mi" aria-current={i.id === selected || undefined} onClick={() => onSelect(i.id)}>
              {i.image !== undefined ? (
                i.image ? <img src={previewSrc(i.image)} alt="" className="cm-mi-img" /> : <span className="cm-mi-img" aria-hidden="true" />
              ) : i.swatch ? (
                <span className="cm-dot lg" style={{ background: i.swatch }} aria-hidden="true" />
              ) : null}
              <span className="cm-mi-text">
                <span className="cm-mi-title">{i.title}</span>
                <span className="cm-mi-sub">{i.sub ?? i.id}</span>
              </span>
              {i.badge}
              {!!i.issues && (
                <span className="cm-issue-dot" title={`${num(i.issues)} مورد`}>
                  <Warning size={14} aria-hidden />
                  <span className="sr-only">{num(i.issues)} مورد قابل بررسی</span>
                </span>
              )}
            </button>
          </li>
        ))}
        {!shown.length && <li className="empty small">{s ? "موردی پیدا نشد." : "هنوز موردی نیست."}</li>}
      </ul>
    </section>
  );
}

/** Reorder, duplicate and delete for the item open in the detail pane. */
export function ItemTools({ index, count, onMove, onDuplicate, onDelete, what, disabled }: { index: number; count: number; onMove: (d: -1 | 1) => void; onDuplicate?: () => void; onDelete: () => void; what: string; disabled?: boolean }) {
  return (
    <div className="row" style={{ gap: 2 }}>
      <button type="button" className="btn sm ghost icon-btn" disabled={disabled || index <= 0} onClick={() => onMove(-1)} aria-label={`${what}: یکی بالاتر`} title="یکی بالاتر">
        <ArrowUp size={16} aria-hidden />
      </button>
      <button type="button" className="btn sm ghost icon-btn" disabled={disabled || index >= count - 1} onClick={() => onMove(1)} aria-label={`${what}: یکی پایین‌تر`} title="یکی پایین‌تر">
        <ArrowDown size={16} aria-hidden />
      </button>
      {onDuplicate && (
        <button type="button" className="btn sm ghost" disabled={disabled} onClick={onDuplicate}>
          <Copy size={16} aria-hidden /> رونوشت
        </button>
      )}
      <button type="button" className="btn sm danger" disabled={disabled} onClick={onDelete}>
        <Trash size={16} aria-hidden /> حذف
      </button>
    </div>
  );
}

/** Issues for the item open in the detail pane. */
export function IssueList({ issues }: { issues: { level: "bad" | "warn"; text: string }[] }) {
  if (!issues.length) return null;
  return (
    <ul className="cm-issues" aria-label="موارد قابل بررسی">
      {issues.map((i) => (
        <li key={i.text} data-level={i.level}>
          <Warning size={14} aria-hidden /> {i.text}
        </li>
      ))}
    </ul>
  );
}

export const move = <T,>(list: T[], i: number, d: -1 | 1) => {
  const n = [...list];
  [n[i], n[i + d]] = [n[i + d]!, n[i]!];
  return n;
};
export const numOrUndef = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));
