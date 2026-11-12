"use client";

import { useState } from "react";
import { FileXls, Warning } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { num } from "@/lib/fa";
import { ErrorNote } from "@/components/ui";

type Change = { op: "add" | "remove" | "replace"; path: string; old?: unknown; new?: unknown };
type Result = {
  charts: { file: string; shape: string | null; diameters: number[]; sizes: number; closures: string[] }[];
  warnings: string[];
  added: string[];
  changes: Change[];
  base_revision_id: string | null;
  revision: { id: string; number: number } | null;
};

const SHAPE_FA: Record<string, string> = { circular: "گرد", oval: "بیضی" };
const OP_FA: Record<Change["op"], string> = { add: "افزوده", remove: "حذف", replace: "تغییر" };
const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v));

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/**
 * Bulk import: the Arapoush size charts (.xlsx), all shapes at once. Preview shows what each chart
 * changes in the saved draft; applying saves a new draft, which the manager then loads.
 */
export function ImportPanel({ dirty, onApplied }: { dirty: boolean; onApplied: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const run = async (apply: boolean) => {
    setBusy(apply ? "apply" : "preview");
    setError(null);
    try {
      const payload = { files: await Promise.all(files.map(async (f) => ({ name: f.name, data: await toBase64(f) }))), keep_missing: keep, apply, base_revision_id: apply ? result?.base_revision_id : undefined };
      const r = await api<Result>("/v1/manage/catalogue/tube/import", { body: payload });
      setResult(r);
      if (r.revision) onApplied();
    } catch (e) {
      setError(e as ApiError);
      if (apply && (e as ApiError).code === "CONFLICT_BASE_REVISION") setResult(null);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>۱. انتخاب فایل‌های جدول سایز</h2>
        </div>
        <div className="card-body stack">
          {dirty && (
            <p className="note warn" role="status">
              تغییرات ذخیره‌نشده دارید. پیش از اعمال جدول، آن‌ها را ذخیره یا رها کنید؛ ورود از اکسل روی آخرین پیش‌نویس ذخیره‌شده اعمال می‌شود.
            </p>
          )}
          <p className="small muted">برای هر مقطع یک فایل (مثلاً «مقطع دایره» و «مقطع بیضی»). درب‌ها با نام یا نام‌های اکسلِ ثبت‌شده شناخته می‌شوند؛ درب ناشناخته به‌صورت مورد تازه اضافه و علامت‌گذاری می‌شود.</p>
          <label className="stack" style={{ gap: 6 }}>
            <span>فایل‌های جدول سایز (xlsx)</span>
            <input
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []));
                setResult(null);
              }}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => (setKeep(e.target.checked), setResult(null))} />
            <span>قطرها و درب‌هایی که در جدول نیامده‌اند نگه داشته شوند</span>
          </label>
          <div className="row">
            <button type="button" className="btn" disabled={!files.length || !!busy} onClick={() => run(false)} aria-busy={busy === "preview" || undefined}>
              <FileXls size={18} aria-hidden /> {busy === "preview" ? "در حال خواندن…" : "پیش‌نمایش تغییرات"}
            </button>
          </div>
          <ErrorNote error={error} />
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="card-head">
            <h2>۲. بررسی</h2>
            {result.revision ? (
              <span className="badge ok">پیش‌نویس شمارهٔ {num(result.revision.number)} ذخیره شد</span>
            ) : (
              <span className="badge">{num(result.changes.length)} تغییر</span>
            )}
          </div>
          <div className="card-body stack">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">فایل</th>
                    <th scope="col">مقطع</th>
                    <th scope="col">قطرها (mm)</th>
                    <th scope="col">ردیف سایز</th>
                    <th scope="col">درب‌ها</th>
                  </tr>
                </thead>
                <tbody>
                  {result.charts.map((c) => (
                    <tr key={c.file}>
                      <td dir="ltr">{c.file}</td>
                      <td>{c.shape ? (SHAPE_FA[c.shape] ?? c.shape) : <span className="badge bad">خوانده نشد</span>}</td>
                      <td dir="ltr">{c.diameters.join(" · ")}</td>
                      <td>{num(c.sizes)}</td>
                      <td>{c.closures.join("، ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.warnings.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <h3 className="row">
                  <Warning size={16} aria-hidden /> موارد قابل بررسی ({num(result.warnings.length)})
                </h3>
                <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
                  {result.warnings.map((w) => (
                    <li key={w} dir="auto">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.added.length > 0 && (
              <p className="small">
                <span className="badge warn">درب تازه</span> {result.added.join("، ")} — نام انگلیسی و ترکی، تصویر و خانوادهٔ سه‌بعدی را در زبانهٔ <a href="#closures">درب‌ها</a> تکمیل کنید.
              </p>
            )}

            {result.changes.length > 0 ? (
              <details>
                <summary>فهرست تغییرات ({num(result.changes.length)})</summary>
                <div className="table-wrap" style={{ maxBlockSize: 420, overflow: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">نوع</th>
                        <th scope="col">مسیر</th>
                        <th scope="col">قبل</th>
                        <th scope="col">بعد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.changes.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <span className={`badge ${c.op === "remove" ? "bad" : c.op === "add" ? "ok" : "warn"}`}>{OP_FA[c.op]}</span>
                          </td>
                          <td dir="ltr">
                            <code className="small">{c.path}</code>
                          </td>
                          <td dir="ltr" className="small">{show(c.old)}</td>
                          <td dir="ltr" className="small">{show(c.new)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : (
              <p className="small muted">جدول با پیش‌نویس فعلی یکی است؛ تغییری لازم نیست.</p>
            )}

            <div className="row">
              {!result.revision && result.changes.length > 0 && (
                <button type="button" className="btn primary" disabled={!!busy || dirty} onClick={() => run(true)} aria-busy={busy === "apply" || undefined}>
                  {busy === "apply" ? "در حال ذخیره…" : "ذخیره به‌عنوان پیش‌نویس"}
                </button>
              )}
              {result.revision && <span className="small muted">پیش‌نویس تازه در زبانه‌های دیگر بارگذاری شد؛ بررسی و سپس منتشر کنید.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
