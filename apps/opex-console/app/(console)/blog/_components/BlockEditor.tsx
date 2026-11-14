"use client";

import { useState } from "react";
import type { BlogBlock, BlogBlockKind, BlogImage } from "@arapoush/schema";
import { previewSrc } from "@/lib/api";
import { Dialog } from "@/components/ui";
import { MediaLibrary, assetUrl } from "@/components/MediaLibrary";
import { newId } from "./lib";

const KIND_LABEL: Record<BlogBlockKind, string> = {
  p: "پاراگراف",
  h: "سرتیتر",
  list: "فهرست",
  image: "تصویر",
  quote: "نقل‌قول",
  callout: "کادر نکته",
  table: "جدول",
  cta: "دعوت به اقدام",
};
const fresh = (kind: BlogBlockKind): BlogBlock => {
  const id = newId();
  switch (kind) {
    case "p":
      return { id, kind, text: "" };
    case "h":
      return { id, kind, level: 2, text: "" };
    case "list":
      return { id, kind, ordered: false, items: [""] };
    case "image":
      return { id, kind, image: { src: "" }, caption: "" };
    case "quote":
      return { id, kind, text: "", cite: "" };
    case "callout":
      return { id, kind, tone: "tip", title: "", text: "" };
    case "table":
      return { id, kind, head: ["", ""], rows: [["", ""]], caption: "" };
    case "cta":
      return { id, kind, text: "", button: "درخواست قیمت", href: "/contact" };
  }
};

/** Picks an image from the media library (scanned uploads) and returns it with its real size. */
export function ImagePick({ value, onChange, label, alt = true }: { value: BlogImage | null; onChange: (v: BlogImage | null) => void; label: string; alt?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small muted">{label}</span>
      {value?.src ? (
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <img src={previewSrc(value.src)} alt="" style={{ inlineSize: 120, blockSize: 72, objectFit: "cover", borderRadius: 6, flex: "none" }} />
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            {alt && (
              <label className="f">
                <span>متن جایگزین (alt)</span>
                <input value={value.alt ?? ""} maxLength={300} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="آنچه در تصویر دیده می‌شود" />
              </label>
            )}
            <div className="row">
              <button type="button" className="btn sm" onClick={() => setOpen(true)}>
                عوض کردن
              </button>
              <button type="button" className="btn sm ghost" onClick={() => onChange(null)}>
                برداشتن
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          انتخاب تصویر از رسانه
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={label} wide>
        <MediaLibrary
          accept="image/*"
          onPick={(a) => {
            onChange({ src: assetUrl(a), ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), alt: value?.alt ?? "" });
            setOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}

/** Body editor: a column of typed blocks (no HTML), each with its own fields and order controls. */
export function BlockEditor({ blocks, onChange, readOnly }: { blocks: BlogBlock[]; onChange: (b: BlogBlock[]) => void; readOnly: boolean }) {
  const set = (i: number, b: BlogBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const insert = (at: number, kind: BlogBlockKind) => onChange([...blocks.slice(0, at), fresh(kind), ...blocks.slice(at)]);
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));

  return (
    <div className="be">
      {blocks.length === 0 && <p className="small muted">متن مقاله را با «پاراگراف» شروع کنید و با «سرتیتر» بخش‌بندی کنید.</p>}
      {blocks.map((b, i) => (
        <div key={b.id} className="be-block" data-kind={b.kind}>
          <div className="be-tools">
            <span className="small muted">{KIND_LABEL[b.kind]}</span>
            {!readOnly && (
              <span className="row" style={{ gap: 2 }}>
                <button type="button" className="btn sm ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`بردن ${KIND_LABEL[b.kind]} به بالا`}>
                  ↑
                </button>
                <button type="button" className="btn sm ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label={`بردن ${KIND_LABEL[b.kind]} به پایین`}>
                  ↓
                </button>
                <AddMenu label="+" onAdd={(k) => insert(i + 1, k)} small />
                <button type="button" className="btn sm ghost danger" onClick={() => remove(i)} aria-label={`حذف ${KIND_LABEL[b.kind]}`}>
                  ×
                </button>
              </span>
            )}
          </div>
          <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
            <BlockFields b={b} onChange={(x) => set(i, x)} />
          </fieldset>
        </div>
      ))}
      {!readOnly && (
        <div className="row" style={{ marginBlockStart: 8 }}>
          <AddMenu label="افزودن بلوک" onAdd={(k) => insert(blocks.length, k)} />
          <span className="small muted">
            قالب متن: <code>**پررنگ**</code> · <code>*کج*</code> · <code>[متن پیوند](/products/multi-layer-tube)</code>
          </span>
        </div>
      )}
    </div>
  );
}

function AddMenu({ label, onAdd, small }: { label: string; onAdd: (k: BlogBlockKind) => void; small?: boolean }) {
  return (
    <select
      aria-label={small ? "افزودن بلوک پس از این" : "افزودن بلوک"}
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as BlogBlockKind);
        e.target.value = "";
      }}
      style={small ? { inlineSize: 44, minBlockSize: 30, padding: "2px 4px" } : { inlineSize: "auto" }}
    >
      <option value="">{label}</option>
      {(Object.keys(KIND_LABEL) as BlogBlockKind[]).map((k) => (
        <option key={k} value={k}>
          {KIND_LABEL[k]}
        </option>
      ))}
    </select>
  );
}

function BlockFields({ b, onChange }: { b: BlogBlock; onChange: (b: BlogBlock) => void }) {
  switch (b.kind) {
    case "p":
      return <textarea aria-label="پاراگراف" rows={Math.max(3, Math.ceil(b.text.length / 90))} maxLength={5000} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />;
    case "h":
      return (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select aria-label="سطح سرتیتر" value={b.level} onChange={(e) => onChange({ ...b, level: Number(e.target.value) as 2 | 3 })} style={{ inlineSize: 90 }}>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input aria-label="متن سرتیتر" value={b.text} maxLength={200} onChange={(e) => onChange({ ...b, text: e.target.value })} style={{ fontWeight: 700, fontSize: b.level === 2 ? "1.1rem" : "1rem" }} />
        </div>
      );
    case "list":
      return (
        <div className="stack" style={{ gap: 6 }}>
          <label className="check small">
            <input type="checkbox" checked={b.ordered} onChange={(e) => onChange({ ...b, ordered: e.target.checked })} />
            فهرست شماره‌دار
          </label>
          <Lines values={b.items} max={1000} label="مورد" onChange={(items) => onChange({ ...b, items })} />
        </div>
      );
    case "image":
      return (
        <div className="stack" style={{ gap: 6 }}>
          <ImagePick label="تصویر" value={b.image.src ? b.image : null} onChange={(v) => onChange({ ...b, image: v ?? { src: "" } })} />
          <label className="f">
            <span>زیرنویس (اختیاری)</span>
            <input value={b.caption ?? ""} maxLength={300} onChange={(e) => onChange({ ...b, caption: e.target.value })} />
          </label>
        </div>
      );
    case "quote":
      return (
        <div className="stack" style={{ gap: 6 }}>
          <textarea aria-label="نقل‌قول" rows={3} maxLength={2000} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />
          <input aria-label="گوینده یا منبع" placeholder="گوینده یا منبع" maxLength={200} value={b.cite ?? ""} onChange={(e) => onChange({ ...b, cite: e.target.value })} />
        </div>
      );
    case "callout":
      return (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <select aria-label="نوع کادر" value={b.tone} onChange={(e) => onChange({ ...b, tone: e.target.value as "tip" })} style={{ inlineSize: 120 }}>
              <option value="tip">نکته</option>
              <option value="info">اطلاعات</option>
              <option value="warn">هشدار</option>
            </select>
            <input aria-label="عنوان کادر" placeholder="عنوان (اختیاری)" maxLength={150} value={b.title ?? ""} onChange={(e) => onChange({ ...b, title: e.target.value })} />
          </div>
          <textarea aria-label="متن کادر" rows={3} maxLength={2000} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />
        </div>
      );
    case "table":
      return <TableFields b={b} onChange={onChange} />;
    case "cta":
      return (
        <div className="stack" style={{ gap: 6 }}>
          <input aria-label="متن دعوت" placeholder="مثلاً: برای نمونهٔ رایگان تیوب با ما تماس بگیرید" maxLength={300} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input aria-label="متن دکمه" maxLength={60} value={b.button} onChange={(e) => onChange({ ...b, button: e.target.value })} />
            <input aria-label="پیوند دکمه" dir="ltr" maxLength={500} value={b.href} onChange={(e) => onChange({ ...b, href: e.target.value })} placeholder="/contact" />
          </div>
        </div>
      );
  }
}

function TableFields({ b, onChange }: { b: Extract<BlogBlock, { kind: "table" }>; onChange: (b: BlogBlock) => void }) {
  const cols = Math.max(1, b.head.length);
  const setCell = (r: number, c: number, v: string) => onChange({ ...b, rows: b.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {b.head.map((h, c) => (
                <th key={c}>
                  <input aria-label={`سرستون ${c + 1}`} value={h} maxLength={200} onChange={(e) => onChange({ ...b, head: b.head.map((x, j) => (j === c ? e.target.value : x)) })} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}>
                    <input aria-label={`ردیف ${r + 1} ستون ${c + 1}`} value={row[c] ?? ""} maxLength={500} onChange={(e) => setCell(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => onChange({ ...b, rows: [...b.rows, Array(cols).fill("")] })} disabled={b.rows.length >= 100}>
          + ردیف
        </button>
        <button type="button" className="btn sm" onClick={() => onChange({ ...b, head: [...b.head, ""], rows: b.rows.map((r) => [...r, ""]) })} disabled={cols >= 10}>
          + ستون
        </button>
        <button type="button" className="btn sm ghost" onClick={() => onChange({ ...b, rows: b.rows.slice(0, -1) })} disabled={b.rows.length <= 1}>
          − ردیف
        </button>
        <button type="button" className="btn sm ghost" onClick={() => onChange({ ...b, head: b.head.slice(0, -1), rows: b.rows.map((r) => r.slice(0, -1)) })} disabled={cols <= 1}>
          − ستون
        </button>
      </div>
      <input aria-label="عنوان جدول" placeholder="عنوان جدول (اختیاری)" maxLength={300} value={b.caption ?? ""} onChange={(e) => onChange({ ...b, caption: e.target.value })} />
    </div>
  );
}

/** A list of one-line values (key takeaways, list items). */
export function Lines({ values, onChange, max, label, limit = 50, multiline = false }: { values: string[]; onChange: (v: string[]) => void; max: number; label: string; limit?: number; multiline?: boolean }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {values.map((v, i) => (
        <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
          {multiline ? (
            <textarea aria-label={`${label} ${i + 1}`} rows={2} maxLength={max} value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          ) : (
            <input aria-label={`${label} ${i + 1}`} maxLength={max} value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          )}
          <button type="button" className="btn sm ghost" onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label={`حذف ${label} ${i + 1}`}>
            ×
          </button>
        </div>
      ))}
      {values.length < limit && (
        <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => onChange([...values, ""])}>
          + {label}
        </button>
      )}
    </div>
  );
}
