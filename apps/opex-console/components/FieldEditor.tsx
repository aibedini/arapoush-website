"use client";

import { createContext, useContext, useState } from "react";
import { ArrowDown, ArrowUp, CaretDown, Plus, Trash } from "@phosphor-icons/react";
import type { Field, GroupField, ImageValue, ListField, Localized } from "@arapoush/schema";
import { previewSrc } from "@/lib/api";
import { LOCALE_LABEL, num } from "@/lib/fa";
import { MediaLibrary, assetUrl, type Asset } from "./MediaLibrary";
import { Dialog } from "./ui";

const LOCALES = ["fa", "en", "tr"] as const;
type Ctx = { canEdit: boolean; superAdmin: boolean };
type Props = { field: Field; value: unknown; orig: unknown; onChange: (v: unknown) => void; name: string; path: string; ctx: Ctx };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Keys are shown as labels when the schema has none: camelCase → words. */
const nice = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");

/** Persian names for the field keys and schema labels operators meet most (falls back to the key). */
const FA: Record<string, string> = {
  title: "عنوان", subtitle: "زیرعنوان", heading: "سرتیتر", eyebrow: "برچسب بالای عنوان", lead: "متن معرفی", text: "متن", body: "متن", description: "توضیح",
  label: "برچسب", name: "نام", items: "موارد", slides: "اسلایدها", cards: "کارت‌ها", articles: "مقاله‌ها", image: "تصویر", images: "تصویرها", photo: "عکس",
  alt: "متن جایگزین", href: "پیوند", link: "پیوند", links: "پیوندها", url: "نشانی", cta: "دعوت به اقدام", button: "دکمه", buttons: "دکمه‌ها", viewAll: "دیدن همه",
  meta: "سئو (عنوان و توضیح صفحه)", nav: "منوی بالا", footer: "پانویس", contact: "اطلاعات تماس", social: "شبکه‌های اجتماعی", email: "ایمیل", phone: "تلفن",
  address: "نشانی", hero: "بخش بالای صفحه", products: "محصولات", applications: "کاربردها", partners: "مشتریان", certifications: "گواهینامه‌ها", insights: "مقاله‌ها",
  features: "ویژگی‌ها", sizes: "اندازه‌ها", caps: "درپوش‌ها", variants: "گونه‌ها", logo: "لوگو", logos: "لوگوها", date: "تاریخ", tag: "برچسب", tags: "برچسب‌ها",
  sections: "بخش‌ها", listLabel: "برچسب فهرست (برای صفحه‌خوان)", ariaLabel: "برچسب دسترس‌پذیری", enabled: "نمایش", type: "نوع", props: "محتوای بخش", tone: "زمینه", imageSide: "جای تصویر", form: "فرم (نشانی)", size: "فاصله",
  q: "پرسش", a: "پاسخ", common: "عمومی", search: "جستجو", downloads: "دانلودها", samples: "نمونه‌ها", guide: "راهنمای انتخاب", compare: "مقایسه", tech: "فناوری‌ها",
  configurator: "پیکربندی‌کننده", quote: "درخواست قیمت", note: "یادداشت", caption: "زیرنویس", value: "مقدار", unit: "واحد", id: "شناسه",
  "Block content": "محتوای بخش", "Eyebrow": "برچسب بالای عنوان", "Title": "عنوان", "Text": "متن", "Image": "تصویر", "Image side": "جای تصویر", "Background": "زمینه",
  "Button": "دکمه", "Button label": "متن دکمه", "Button link": "پیوند دکمه", "Questions": "پرسش‌ها", "Question": "پرسش", "Answer": "پاسخ", "Form address (slug)": "فرم (نشانی)",
  "Space": "اندازهٔ فاصله", "Sections": "بخش‌ها", "Section type": "نوع بخش",
};
const ENUM_FA: Record<string, string> = { start: "سمت شروع", end: "سمت پایان", light: "روشن", dark: "تیره", s: "کم", m: "متوسط", l: "زیاد", richText: "متن", imageText: "تصویر و متن", cta: "دعوت به اقدام", faq: "پرسش‌های پرتکرار", form: "فرم", spacer: "فاصله", hero: "اسلایدر", products: "محصولات", applications: "کاربردها", insights: "مقاله‌ها", partners: "مشتریان", certifications: "گواهینامه‌ها" };
export const faLabel = (key: string, schemaLabel?: string) => (schemaLabel && FA[schemaLabel]) || FA[key] || schemaLabel || nice(key);

/** Which language(s) the localized inputs show: one at a time keeps long forms readable. */
export type LocaleView = "all" | "fa" | "en" | "tr";
export const LocaleViewContext = createContext<LocaleView>("all");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A blank value with the right shape, for new list items. */
export function blank(f: Field): unknown {
  switch (f.kind) {
    case "text":
      return f.localized ? {} : "";
    case "url":
      return f.localized ? {} : "";
    case "number":
      return f.min ?? 0;
    case "boolean":
      return false;
    case "enum":
      return f.values[0] ?? "";
    case "image":
      return f.path ? "" : f.perLocale ? { default: { src: "" } } : { src: "" };
    case "file":
      return { src: "" };
    case "list":
      return [];
    case "group":
      return Object.fromEntries(Object.entries(f.fields).map(([k, c]) => [k, blank(c)]));
  }
}

function Badges({ f }: { f: Field }) {
  return (
    <>
      {f.locked && <span className="badge warn">قفل</span>}
      {f.operatorOnly && <span className="badge accent">فقط اپراتور</span>}
      {f.required && <span className="badge">الزامی</span>}
    </>
  );
}

function LocalizedInput({ f, value, onChange, disabled, name, multiline, ltrOnly, path }: { f: Field; value: unknown; onChange: (v: unknown) => void; disabled: boolean; name: string; multiline?: boolean; ltrOnly?: boolean; path?: string }) {
  const v = obj(value) as Localized;
  const max = f.kind === "text" ? f.max : undefined;
  const view = useContext(LocaleViewContext);
  const shown = view === "all" ? LOCALES : LOCALES.filter((l) => l === view);
  return (
    <div className="locs" data-view={view}>
      {shown.map((l) => {
        const dir = l === "fa" && !ltrOnly ? "rtl" : "ltr";
        const props = {
          dir,
          lang: l,
          disabled,
          maxLength: max,
          "aria-label": `${name} — ${LOCALE_LABEL[l]}${path ? ` (${path})` : ""}`,
          value: v[l] ?? "",
          placeholder: l !== "fa" && !v[l] ? (v.en ?? v.fa ?? "") : undefined,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const next = { ...v, [l]: e.target.value };
            if (!e.target.value) delete next[l];
            onChange(next);
          },
        } as const;
        return (
          <label key={l} className="loc">
            <span>
              {LOCALE_LABEL[l]}
              {!v[l] && Object.values(v).some(Boolean) && <span className="badge warn" style={{ marginInlineStart: 6 }}>ترجمه نشده</span>}
            </span>
            {multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
          </label>
        );
      })}
    </div>
  );
}

function ImageInput({ value, onChange, disabled, name, asPath }: { value: unknown; onChange: (v: unknown) => void; disabled: boolean; name: string; asPath?: boolean }) {
  const [open, setOpen] = useState(false);
  const img = (asPath ? { src: typeof value === "string" ? value : "" } : obj(value)) as ImageValue;
  const pick = (a: Asset) => {
    setOpen(false);
    onChange(asPath ? assetUrl(a) : { ...img, src: assetUrl(a), width: a.width ?? undefined, height: a.height ?? undefined });
  };
  return (
    <div className="stack">
      <div className="img-field">
        {img.src ? <img className="thumb" src={previewSrc(img.src)} alt="" /> : <div className="thumb" aria-hidden="true" />}
        <div className="stack" style={{ gap: 4, flex: 1, minInlineSize: 200 }}>
          <code className="small">{img.src || "—"}</code>
          {img.width ? (
            <span className="small muted">
              {img.width}×{img.height}
            </span>
          ) : null}
          <div className="row">
            <button type="button" className="btn sm" disabled={disabled} onClick={() => setOpen(true)}>
              انتخاب از رسانه
            </button>
          </div>
        </div>
      </div>
      {!asPath && img.src && (
        <div>
          <div className="small muted">متن جایگزین (alt)</div>
          <LocalizedInput f={{ kind: "text", localized: true, max: 300 }} name={`${name} alt`} value={img.alt} disabled={disabled} onChange={(alt) => onChange({ ...img, alt })} />
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={`انتخاب تصویر: ${name}`} wide>
        <MediaLibrary onPick={pick} accept="image/*,.svg" />
      </Dialog>
    </div>
  );
}

function ListEditor({ f, value, orig, onChange, name, path, ctx, disabled }: Props & { f: ListField; disabled: boolean }) {
  const items = Array.isArray(value) ? value : [];
  const origItems = Array.isArray(orig) ? orig : [];
  const set = (i: number, v: unknown) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...items];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };
  const keyOf = (it: unknown, i: number) => (f.key && obj(it)[f.key] !== undefined ? String(obj(it)[f.key]) : String(i + 1));
  const titleOf = (it: unknown) => {
    if (typeof it === "string") return it;
    const o = obj(it);
    if (typeof o.fa === "string" || typeof o.en === "string") return String(o.fa ?? o.en);
    for (const k of ["title", "name", "label", "heading", "q", "text"]) {
      const t = o[k];
      if (typeof t === "string") return t;
      if (Array.isArray(t)) return t.map((x) => (typeof x === "string" ? x : ((x as Localized)?.fa ?? ""))).join(" ");
      if (t && typeof t === "object") return String((t as Localized).fa ?? (t as Localized).en ?? "");
    }
    return "";
  };
  const fixed = f.fixed || disabled;
  return (
    <div>
      {items.map((it, i) => {
        const o = f.key ? origItems.find((x) => obj(x)[f.key!] === obj(it)[f.key!]) : origItems[i];
        return (
          <details key={f.key ? keyOf(it, i) : i} className={`list-item${same(it, o) ? "" : " changed"}`} open={items.length <= 2 || !o}>
            <summary className="li-head">
              <CaretDown size={14} className="li-caret" aria-hidden />
              <span className="li-title small">
                <b>{num(i + 1)}</b> {titleOf(it) || <span className="muted">بدون عنوان</span>}
              </span>
              {!same(it, o) && <span className="badge warn">تغییر کرده</span>}
              {!fixed && (
                <span className="row li-tools" onClick={(e) => e.preventDefault()}>
                  <button type="button" className="btn sm ghost icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`بالا بردن مورد ${i + 1}`}>
                    <ArrowUp size={15} aria-hidden />
                  </button>
                  <button type="button" className="btn sm ghost icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`پایین بردن مورد ${i + 1}`}>
                    <ArrowDown size={15} aria-hidden />
                  </button>
                  <button type="button" className="btn sm ghost icon-btn danger" disabled={f.min !== undefined && items.length <= f.min} onClick={() => confirm(`مورد ${i + 1} حذف شود؟`) && onChange(items.filter((_, j) => j !== i))} aria-label={`حذف مورد ${i + 1}`}>
                    <Trash size={15} aria-hidden />
                  </button>
                </span>
              )}
            </summary>
            <FieldEditor field={f.of} value={it} orig={o} onChange={(v) => set(i, v)} name={`${name} ${i + 1}`} path={`${path}[${i}]`} ctx={ctx} inList />
          </details>
        );
      })}
      {!fixed && (f.max === undefined || items.length < f.max) && (
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            const b = blank(f.of);
            if (f.key && b && typeof b === "object") (b as Record<string, unknown>)[f.key] = `new-${Date.now().toString(36)}`;
            onChange([...items, b]);
          }}
        >
          <Plus size={14} aria-hidden /> افزودن مورد
        </button>
      )}
    </div>
  );
}

/** Renders one schema field; groups and lists recurse. Changed fields get a marker in the margin. */
export function FieldEditor({ field: f, value, orig, onChange, name, path, ctx, inList }: Props & { inList?: boolean }) {
  const disabled = !ctx.canEdit || (!!f.locked && !ctx.superAdmin);
  const changed = !same(value, orig);
  const label = faLabel(name.split(" ").pop() ?? name, f.label);

  if (f.kind === "group") {
    const v = obj(value);
    const o = obj(orig);
    const body = Object.entries((f as GroupField).fields).map(([k, c]) => (
      <FieldEditor key={k} field={c} value={v[k]} orig={o[k]} name={k} path={`${path}/${k}`} ctx={ctx} onChange={(x) => onChange({ ...v, [k]: x })} />
    ));
    if (inList) return <div style={{ display: "grid" }}>{body}</div>;
    return (
      <details className="group" open={path.split("/").length <= 2}>
        <summary>
          {label} <Badges f={f} />
          {changed && <span className="badge warn">تغییر کرده</span>}
        </summary>
        <div className="group-body">{body}</div>
      </details>
    );
  }

  let input: React.ReactNode;
  switch (f.kind) {
    case "text":
      input = f.localized ? (
        <LocalizedInput f={f} value={value} onChange={onChange} disabled={disabled} name={label} path={path} multiline={f.multiline} />
      ) : f.multiline ? (
        <textarea value={String(value ?? "")} maxLength={f.max} disabled={disabled} aria-label={`${label} (${path})`} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={String(value ?? "")} maxLength={f.max} disabled={disabled} aria-label={`${label} (${path})`} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "url":
      input = f.localized ? (
        <LocalizedInput f={f} value={value} onChange={onChange} disabled={disabled} name={label} path={path} ltrOnly />
      ) : (
        <input dir="ltr" value={String(value ?? "")} disabled={disabled} aria-label={`${label} (${path})`} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "number":
      input = <input type="number" dir="ltr" style={{ maxInlineSize: 180 }} step={f.integer ? 1 : "any"} min={f.min} max={f.max} value={value === undefined || value === null ? "" : Number(value)} disabled={disabled} aria-label={`${label} (${path})`} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
      break;
    case "boolean":
      input = (
        <label className="check">
          <input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          <span>{label}</span>
        </label>
      );
      break;
    case "enum":
      input = (
        <select style={{ maxInlineSize: 280 }} value={String(value ?? "")} disabled={disabled} aria-label={`${label} (${path})`} onChange={(e) => onChange(e.target.value)}>
          {f.values.map((x) => (
            <option key={x} value={x}>
              {ENUM_FA[x] ?? x}
            </option>
          ))}
        </select>
      );
      break;
    case "image":
      if (f.perLocale) {
        const v = obj(value);
        input = (
          <div className="stack">
            {(["default", ...LOCALES] as const).map((l) => (
              <div key={l}>
                <div className="small muted">{l === "default" ? "پیش‌فرض (همهٔ زبان‌ها)" : `فقط ${LOCALE_LABEL[l]}`}</div>
                <ImageInput
                  value={v[l]}
                  disabled={disabled}
                  name={`${label} ${l}`}
                  onChange={(x) => {
                    const n = { ...v, [l]: x };
                    if (l !== "default" && !(x as ImageValue)?.src) delete n[l];
                    onChange(n);
                  }}
                />
              </div>
            ))}
          </div>
        );
      } else input = <ImageInput value={value} onChange={onChange} disabled={disabled} name={label} asPath={f.path} />;
      break;
    case "file":
      input = <input dir="ltr" value={String(obj(value).src ?? "")} disabled={disabled} aria-label={`${label} (${path})`} onChange={(e) => onChange({ ...obj(value), src: e.target.value })} />;
      break;
    case "list":
      input = <ListEditor f={f} value={value} orig={orig} onChange={onChange} name={label} path={path} ctx={ctx} field={f} disabled={disabled} />;
      break;
  }

  return (
    <div className={`fld${changed && f.kind !== "list" ? " changed" : ""}`}>
      {f.kind !== "boolean" && (
        <div className="fld-label">
          <span>{label}</span>
          <Badges f={f} />
          {f.kind === "list" && <span className="badge">{Array.isArray(value) ? value.length : 0} مورد</span>}
        </div>
      )}
      {f.help && <div className="small muted">{f.help}</div>}
      {input}
    </div>
  );
}
