"use client";

import { useEffect, useState } from "react";
import { BUILTIN_FONTS, type FontFamily, type FontSettings } from "@arapoush/schema";
import { Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { EntryBar } from "@/components/EntryBar";
import { assetUrl, MediaLibrary, type Asset } from "@/components/MediaLibrary";
import { uniqueKey } from "@/components/slider/model";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";
import { previewSrc } from "@/lib/api";
import { canWrite, useApi, useMe } from "@/lib/hooks";
import { useEntry } from "@/lib/useEntry";

const LOCALES = [
  ["fa", "فارسی"],
  ["en", "English"],
  ["tr", "Türkçe"],
] as const;
const SAMPLE: Record<string, string> = { fa: "بسته‌بندی، از نو. ۱۲۳۴۵۶۷۸۹۰", en: "Packaging, reimagined. 1234567890", tr: "Ambalaj, yeniden. ÇĞİÖŞÜ 1234567890" };
const SECTION_LABEL: Record<string, string> = { header: "سربرگ (منو)", footer: "پاورقی", hero: "اسلایدر", products: "محصولات", applications: "کاربردها", insights: "مقاله‌ها", partners: "مشتریان", certifications: "گواهینامه‌ها" };

/** Shows uploaded faces in the console (the site loads them itself, only where used). */
function useFaces(families: FontFamily[]) {
  useEffect(() => {
    if (typeof FontFace === "undefined") return;
    for (const f of families)
      for (const file of f.files ?? []) {
        if (!file.src) continue;
        new FontFace(`opex-${f.key}`, `url(${previewSrc(file.src)})`, { weight: String(file.weight ?? 400), style: file.style ?? "normal" }).load().then((x) => document.fonts.add(x), () => {});
      }
  }, [families]);
}

/** Site fonts (`global.site` → `fonts`): uploaded families, per-language choice, per-section choice. */
export default function FontsPage() {
  const me = useMe();
  const e = useEntry("global.site");
  const layout = useApi<{ draft: { data: { sections?: { id: string; type: string }[] } } | null }>("/v1/manage/entries/page.home.layout");
  const [upFor, setUpFor] = useState<string | null>(null);
  const fonts = ((e.data?.fonts as FontSettings | undefined) ?? {}) as FontSettings;
  const families = fonts.families ?? [];
  useFaces(families);
  if (e.view.error) return <ErrorNote error={e.view.error} />;
  if (!e.data) return <Loading rows={8} />;
  const dis = !canWrite(me);
  const set = (f: FontSettings) => e.setData({ ...e.data!, fonts: f });
  const setFamily = (key: string, fn: (f: FontFamily) => FontFamily | null) => set({ ...fonts, families: families.flatMap((f) => (f.key === key ? [fn(f)].filter((x): x is FontFamily => !!x) : [f])) });
  const options: [string, string][] = [...Object.entries(BUILTIN_FONTS), ...families.map((f) => [f.key, f.name] as [string, string])];
  const stack = (id?: string) => (!id || id === "sans" ? undefined : id === "ui" ? "Inter, var(--font)" : id === "mark" ? "ui-monospace, monospace" : `"opex-${id}", var(--font)`);
  const sections = [...new Set(["header", ...(layout.data?.draft?.data.sections ?? []).map((s) => s.id), "footer"])];

  const addFamily = () => {
    const key = uniqueKey("font", families.map((f) => f.key));
    set({ ...fonts, families: [...families, { key, name: "فونت تازه", fallback: "sans", files: [] }] });
    setUpFor(key);
  };
  const addFile = (a: Asset) => {
    if (!upFor) return;
    const weight = /(thin|100)/i.test(a.original_name) ? 100 : /(light|300)/i.test(a.original_name) ? 300 : /(medium|500)/i.test(a.original_name) ? 500 : /(semi|600)/i.test(a.original_name) ? 600 : /(bold|700)/i.test(a.original_name) ? 700 : /(black|heavy|900)/i.test(a.original_name) ? 900 : 400;
    setFamily(upFor, (f) => ({ ...f, name: f.name === "فونت تازه" ? a.original_name.replace(/[-_ ]?(thin|light|regular|medium|semibold|bold|black|heavy|\d00)?\.(woff2?|ttf|otf)$/i, "") || f.name : f.name, files: [...f.files, { src: assetUrl(a), weight, style: /italic/i.test(a.original_name) ? "italic" : "normal" }] }));
    setUpFor(null);
  };

  return (
    <>
      <PageHead title="فونت‌های سایت" sub="فونت دلخواه را بارگذاری کنید و برای هر زبان یا هر بخش انتخاب کنید" />
      <EntryBar e={e} type="global.site" />
      <div className="stack">
        <section className="card" aria-labelledby="fam-h">
          <div className="card-head">
            <h2 id="fam-h">فونت‌های بارگذاری‌شده</h2>
            {!dis && (
              <button type="button" className="btn sm primary" onClick={addFamily}>
                <Plus size={14} aria-hidden /> فونت تازه
              </button>
            )}
          </div>
          <div className="card-body stack">
            <p className="small muted">هر فونت می‌تواند چند فایل داشته باشد (مثلاً نازک، معمولی، ضخیم). WOFF2 سبک‌ترین است. فقط فونت‌هایی را بارگذاری کنید که مجوز استفادهٔ وب دارند. سایت هر فایل را فقط وقتی دانلود می‌کند که متنی در صفحه از آن استفاده کند.</p>
            {!families.length && <div className="empty">هنوز فونتی بارگذاری نشده است. فونت‌های فعلی سایت (وزیرمتن، Helvetica Neue، Inter) سر جایشان هستند.</div>}
            {families.map((f) => (
              <div key={f.key} className="font-card">
                <div className="row">
                  <label className="f" style={{ flex: "1 1 200px" }}>
                    <span>نام</span>
                    <input value={f.name} disabled={dis} onChange={(ev) => setFamily(f.key, (x) => ({ ...x, name: ev.target.value }))} />
                  </label>
                  <label className="f">
                    <span>جایگزین تا بارگذاری</span>
                    <select value={f.fallback ?? "sans"} disabled={dis} onChange={(ev) => setFamily(f.key, (x) => ({ ...x, fallback: ev.target.value as FontFamily["fallback"] }))}>
                      <option value="sans">بدون سریف</option>
                      <option value="serif">سریف</option>
                      <option value="mono">هم‌عرض</option>
                    </select>
                  </label>
                  {!dis && (
                    <button type="button" className="btn sm danger" onClick={() => confirm(`فونت «${f.name}» حذف شود؟`) && setFamily(f.key, () => null)} style={{ alignSelf: "end" }}>
                      <Trash size={14} aria-hidden /> حذف
                    </button>
                  )}
                </div>
                <p className="font-sample" style={{ fontFamily: `"opex-${f.key}", var(--font)` }}>
                  {SAMPLE.fa}
                  <br />
                  <span dir="ltr">{SAMPLE.en}</span>
                </p>
                <ul className="font-files">
                  {f.files.map((file, i) => (
                    <li key={file.src + i} className="row">
                      <code>{file.src.split("/").pop()}</code>
                      <select aria-label="وزن" value={file.weight ?? 400} disabled={dis} onChange={(ev) => setFamily(f.key, (x) => ({ ...x, files: x.files.map((y, j) => (j === i ? { ...y, weight: Number(ev.target.value) } : y)) }))} style={{ inlineSize: "auto" }}>
                        {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                          <option key={w} value={w}>
                            وزن {w}
                          </option>
                        ))}
                      </select>
                      <select aria-label="سبک" value={file.style ?? "normal"} disabled={dis} onChange={(ev) => setFamily(f.key, (x) => ({ ...x, files: x.files.map((y, j) => (j === i ? { ...y, style: ev.target.value as "normal" | "italic" } : y)) }))} style={{ inlineSize: "auto" }}>
                        <option value="normal">معمولی</option>
                        <option value="italic">ایتالیک</option>
                      </select>
                      <span style={{ fontFamily: `"opex-${f.key}"`, fontWeight: file.weight ?? 400, fontStyle: file.style }}>آراپوش Arapoush</span>
                      {!dis && (
                        <button type="button" className="btn sm ghost" aria-label="حذف فایل" onClick={() => setFamily(f.key, (x) => ({ ...x, files: x.files.filter((_, j) => j !== i) }))}>
                          <Trash size={14} aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {!dis && (
                  <button type="button" className="btn sm" onClick={() => setUpFor(f.key)}>
                    <UploadSimple size={14} aria-hidden /> افزودن فایل فونت
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="loc-h">
          <div className="card-head">
            <h2 id="loc-h">فونت هر زبان</h2>
          </div>
          <div className="card-body stack">
            {LOCALES.map(([l, label]) => {
              const c = fonts.locales?.[l] ?? {};
              const setC = (k: "body" | "heading", v: string) => set({ ...fonts, locales: { ...(fonts.locales ?? {}), [l]: { ...c, [k]: v || undefined } } });
              return (
                <div key={l} className="font-locale">
                  <b>{label}</b>
                  <label className="f">
                    <span>متن</span>
                    <select value={c.body ?? ""} disabled={dis} onChange={(ev) => setC("body", ev.target.value)}>
                      <option value="">پیش‌فرض سایت</option>
                      {options.map(([k, n]) => (
                        <option key={k} value={k}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="f">
                    <span>عنوان‌ها</span>
                    <select value={c.heading ?? ""} disabled={dis} onChange={(ev) => setC("heading", ev.target.value)}>
                      <option value="">مثل متن</option>
                      {options.map(([k, n]) => (
                        <option key={k} value={k}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p dir={l === "fa" ? "rtl" : "ltr"} className="font-sample" style={{ fontFamily: stack(c.body) }}>
                    <span style={{ fontFamily: stack(c.heading ?? c.body), fontWeight: 700 }}>{SAMPLE[l]}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card" aria-labelledby="sec-h">
          <div className="card-head">
            <h2 id="sec-h">فونت هر بخش</h2>
          </div>
          <div className="card-body stack">
            <p className="small muted">بخش‌های صفحهٔ اصلی، سربرگ و پاورقی. اگر خالی بماند، فونت زبان استفاده می‌شود. لایه‌های اسلایدر هم در اسلایدساز فونت خودشان را دارند.</p>
            <div className="font-sections">
              {sections.map((id) => (
                <label key={id} className="f">
                  <span>{SECTION_LABEL[id] ?? id}</span>
                  <select
                    value={fonts.sections?.[id] ?? ""}
                    disabled={dis}
                    onChange={(ev) => {
                      const next = { ...(fonts.sections ?? {}) };
                      if (ev.target.value) next[id] = ev.target.value;
                      else delete next[id];
                      set({ ...fonts, sections: next });
                    }}
                  >
                    <option value="">فونت زبان</option>
                    {options.map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>
      <Dialog open={!!upFor} onClose={() => setUpFor(null)} title="انتخاب یا بارگذاری فایل فونت" wide>
        <MediaLibrary onPick={addFile} accept=".woff2,.woff,.ttf,.otf" kinds={["font/"]} />
      </Dialog>
    </>
  );
}
