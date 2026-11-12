"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, CubeTransparent, Eye, MagicWand, Trash, UploadSimple } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { num } from "@/lib/fa";
import { guessTarget } from "./catalogue/match";
import { PreviewFrames } from "./PreviewFrames";
import { ErrorNote, Loading } from "./ui";

type Axis = "+Y" | "-Y" | "+X" | "-X" | "+Z" | "-Z";
type Mounting = { axis: Axis; anchorMm: [number, number, number]; neckDiameterMm: number; thread?: string };
type Suggested = { axis: Axis; anchorMm: [number, number, number]; neckDiameterMm: number; confidence: "high" | "low"; score: [number, number] };
type Model = {
  id: string;
  closure_id: string;
  shape?: string | null;
  diameter?: number | null;
  source_name: string;
  source_kind: "step" | "glb";
  status: "needs_review" | "approved" | "archived";
  url: string;
  bbox: { min: number[]; max: number[]; size: number[] };
  triangles: number;
  parts: number;
  simplified: boolean;
  mounting: Mounting | null;
  suggested?: Suggested | null;
  created_at: string;
};
type Closure = { id: string; name: { fa?: string; en?: string }; compat?: Record<string, Record<string, string>>; aliases?: string[]; model3d?: { modelId?: string } };
type Shape = { id: string; model?: string; name: { fa?: string; en?: string }; sizes: Record<string, unknown> };
type Cat = { closures: Closure[]; shapes: Shape[] };
type Queued = { key: string; file: File; closure: string; place: string; unit: "m" | "mm"; state: "ready" | "busy" | "done" | "error"; note?: string };

const AXES: Axis[] = ["+Y", "-Y", "+X", "-X", "+Z", "-Z"];
const STATUS: Record<Model["status"], { label: string; cls: string }> = {
  needs_review: { label: "در انتظار بررسی", cls: "warn" },
  approved: { label: "تأییدشده", cls: "ok" },
  archived: { label: "بایگانی", cls: "" },
};
const mm = (n: number) => `${num(Math.round(n * 10) / 10)}`;
const placeOf = (shape?: string | null, d?: number | null) => (shape && d != null ? `${shape}:${d}` : "");

/**
 * Without a suggestion from the geometry: the centre of the face opposite the opening, where the
 * cap's top is. A starting point only; the neck meets the inside of that top.
 */
function topCentre(m: Model, axis: Axis): [number, number, number] {
  const c = m.bbox.min.map((v, i) => (v + m.bbox.max[i]!) / 2) as [number, number, number];
  const i = { X: 0, Y: 1, Z: 2 }[axis[1] as "X" | "Y" | "Z"];
  c[i] = axis[0] === "+" ? m.bbox.min[i]! : m.bbox.max[i]!;
  return c.map((v) => Math.round(v * 100) / 100) as [number, number, number];
}

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/**
 * Factory CAD for closures (T2, T2.1). Drop any number of STEP/STP or GLB files: each is matched to
 * a closure and tube diameter by its name (checked by the operator), converted on the server, and
 * comes back with the mounting read off its geometry. Confident suggestions can be approved
 * together; the rest are checked one by one. Approving saves a new catalogue draft;
 * `onApproved` lets the catalogue manager load it.
 */
export function ClosureModels({ onApproved }: { onApproved?: () => void } = {}) {
  const [cat, setCat] = useState<Cat | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const [entry, list] = await Promise.all([api<{ draft: { id: string; data: Partial<Cat> } | null }>("/v1/manage/entries/product.tube.catalogue"), api<Model[]>("/v1/manage/catalogue/tube/models")]);
    setCat({ closures: entry.draft?.data.closures ?? [], shapes: entry.draft?.data.shapes ?? [] });
    setDraftId(entry.draft?.id ?? null);
    setModels(list);
    return entry.draft?.id ?? null;
  }, []);
  useEffect(() => {
    load().catch(setError);
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy("");
    }
  };

  if (!cat) return <Loading rows={3} />;
  const closureName = (id: string) => cat.closures.find((c) => c.id === id)?.name.fa ?? id;
  const shapeName = (id: string) => cat.shapes.find((s) => s.id === id)?.name.fa ?? id;
  const placeName = (place: string) => (place ? `${shapeName(place.split(":")[0]!)} Ø${place.split(":")[1]}` : "همهٔ قطرها");
  const placesFor = (closure: string) => {
    const c = cat.closures.find((x) => x.id === closure);
    return Object.entries(c?.compat ?? {}).flatMap(([shape, ds]) => Object.keys(ds).map((d) => `${shape}:${d}`));
  };

  const add = (files: FileList | File[]) => {
    const next = Array.from(files)
      .filter((f) => /\.(step|stp|glb)$/i.test(f.name))
      .map((file): Queued => {
        const g = guessTarget(file.name, cat);
        const place = g.closure && g.shape && g.diameter != null && placesFor(g.closure).includes(`${g.shape}:${g.diameter}`) ? `${g.shape}:${g.diameter}` : "";
        return { key: `${file.name}-${file.size}-${Math.random()}`, file, closure: g.closure, place, unit: "m", state: "ready" };
      });
    const skipped = Array.from(files).length - next.length;
    setQueue((q) => [...q, ...next]);
    if (skipped) setError(new ApiError(0, "CLIENT", `${num(skipped)} فایل پذیرفته نشد: فقط STEP، STP و GLB. فایل SolidWorks (SLDPRT) را از خود SolidWorks با «Save As → STEP» خروجی بگیرید.`));
  };
  const setItem = (key: string, p: Partial<Queued>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const ready = queue.filter((x) => x.state !== "done" && x.closure);
  const uploadAll = () =>
    run("upload", async () => {
      for (const item of ready) {
        setItem(item.key, { state: "busy", note: undefined });
        try {
          const [shape, d] = item.place ? item.place.split(":") : [];
          await api("/v1/manage/catalogue/tube/models", { body: { closure: item.closure, ...(shape ? { shape, diameter: Number(d) } : {}), name: item.file.name, data: await toBase64(item.file), unit: item.unit } });
          setItem(item.key, { state: "done" });
        } catch (e) {
          setItem(item.key, { state: "error", note: (e as ApiError).message });
        }
      }
    });

  const confident = models.filter((m) => m.status === "needs_review" && m.suggested?.confidence === "high");
  const approveConfident = () =>
    run("approve-all", async () => {
      let base = draftId;
      for (const m of confident) {
        const s = m.suggested!;
        await api(`/v1/manage/catalogue/tube/models/${m.id}/mounting`, { method: "PUT", body: { axis: s.axis, anchorMm: s.anchorMm, neckDiameterMm: s.neckDiameterMm } });
        const r = await api<{ revision: { id: string } }>(`/v1/manage/catalogue/tube/models/${m.id}/approve`, { body: { base_revision_id: base } });
        base = r.revision.id;
      }
      onApproved?.();
    });

  const shown = models.filter((m) => showArchived || m.status !== "archived");
  const archived = models.length - models.filter((m) => m.status !== "archived").length;

  return (
    <div className="stack">
      <p className="small muted">
        فایل‌های صنعتی درب‌ها (STEP/STP یا GLB) را با هم رها کنید. درب و قطر هر فایل از نامش حدس زده می‌شود (مثلاً «۳۵ فیلیپ تاپ» ← درب فلیپ‌تاپ، قطر ۳۵)؛ پیش از بارگذاری بررسی کنید. سامانه هر فایل را به مدل وب تبدیل می‌کند و از روی هندسه پیدا می‌کند دهانه کدام طرف است، گلو کجا می‌نشیند و قطرش چقدر است. هیچ مدلی بی‌تأیید شما روی سایت نمی‌آید و هرگز برای جا شدن کوچک و بزرگ نمی‌شود.
      </p>

      <label
        className="cm-drop"
        data-drag={drag || undefined}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
      >
        <UploadSimple size={28} aria-hidden />
        <span>فایل‌ها را اینجا رها کنید یا برای انتخاب کلیک کنید</span>
        <span className="small muted">STEP، STP یا GLB · هر فایل تا ۲۵ مگابایت · چند فایل با هم</span>
        <input
          type="file"
          multiple
          className="sr-only"
          accept=".step,.stp,.glb,model/gltf-binary"
          aria-label="انتخاب فایل‌های STEP یا GLB"
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {queue.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>صف بارگذاری ({num(queue.length)})</h3>
            <div className="row">
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => setQueue((q) => q.filter((x) => x.state !== "done"))}>
                پاک کردن تمام‌شده‌ها
              </button>
              <button type="button" className="btn primary" disabled={!ready.length || !!busy} aria-busy={busy === "upload" || undefined} onClick={uploadAll}>
                <UploadSimple size={18} aria-hidden /> {busy === "upload" ? "در حال تبدیل…" : `بارگذاری و تبدیل (${num(ready.length)})`}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="cm-queue">
              <thead>
                <tr>
                  <th scope="col">فایل</th>
                  <th scope="col">درب</th>
                  <th scope="col">قطر</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">
                    <span className="sr-only">ابزار</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((x) => (
                  <tr key={x.key}>
                    <td dir="auto" className="cm-ellipsis" style={{ maxInlineSize: 260 }}>
                      {x.file.name}
                      <div className="small muted">{mm(x.file.size / 1048576)} MB</div>
                    </td>
                    <td>
                      <select value={x.closure} disabled={x.state === "busy" || x.state === "done"} aria-label={`درب برای ${x.file.name}`} aria-invalid={!x.closure || undefined} onChange={(e) => setItem(x.key, { closure: e.target.value, place: placesFor(e.target.value).includes(x.place) ? x.place : "" })}>
                        <option value="">انتخاب کنید…</option>
                        {cat.closures.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name.fa ?? c.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={x.place} disabled={!x.closure || x.state === "busy" || x.state === "done"} aria-label={`قطر برای ${x.file.name}`} onChange={(e) => setItem(x.key, { place: e.target.value })}>
                        <option value="">همهٔ قطرها</option>
                        {placesFor(x.closure).map((p) => (
                          <option key={p} value={p}>
                            {placeName(p)}
                          </option>
                        ))}
                      </select>
                      {/\.glb$/i.test(x.file.name) && (
                        <select value={x.unit} aria-label={`واحد ${x.file.name}`} onChange={(e) => setItem(x.key, { unit: e.target.value as "m" | "mm" })} style={{ marginBlockStart: 4 }}>
                          <option value="m">GLB به متر</option>
                          <option value="mm">GLB به میلی‌متر</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {x.state === "ready" && (x.closure ? <span className="badge">آماده</span> : <span className="badge warn">درب را انتخاب کنید</span>)}
                      {x.state === "busy" && <span className="badge accent">در حال تبدیل…</span>}
                      {x.state === "done" && <span className="badge ok">تبدیل شد</span>}
                      {x.state === "error" && <span className="badge bad" title={x.note}>نشد</span>}
                      {x.note && <div className="small pf-err">{x.note}</div>}
                    </td>
                    <td>
                      <button type="button" className="btn sm ghost icon-btn" disabled={x.state === "busy"} onClick={() => setQueue((q) => q.filter((y) => y.key !== x.key))} aria-label={`برداشتن ${x.file.name} از صف`}>
                        <Trash size={16} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ErrorNote error={error} />

      {models.length > 0 && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small muted">
            {num(models.filter((m) => m.status === "needs_review").length)} در انتظار بررسی · {num(models.filter((m) => m.status === "approved").length)} تأییدشده
            {archived > 0 && (
              <>
                {" · "}
                <button type="button" className="link" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? "پنهان کردن بایگانی" : `نمایش ${num(archived)} بایگانی`}
                </button>
              </>
            )}
          </span>
          {confident.length > 0 && (
            <button type="button" className="btn primary" disabled={!!busy} aria-busy={busy === "approve-all" || undefined} onClick={approveConfident}>
              <MagicWand size={18} aria-hidden /> تأیید همهٔ پیشنهادهای مطمئن ({num(confident.length)})
            </button>
          )}
        </div>
      )}

      {models.length === 0 ? (
        <p className="small muted">هنوز مدلی بارگذاری نشده است. تا آن زمان درب‌ها با شکل پارامتریک نمایش داده می‌شوند.</p>
      ) : (
        shown.map((m) => (
          <ModelCard
            key={m.id}
            m={m}
            name={closureName(m.closure_id)}
            place={placeName(placeOf(m.shape, m.diameter))}
            busy={busy}
            draftId={draftId}
            run={run}
            onApproved={onApproved}
            onPreview={() => setPreview(`cap=${m.closure_id}${m.shape && m.diameter != null ? `&shape=${m.shape}&d=${m.diameter}` : ""}`)}
          />
        ))
      )}
      <PreviewFrames open={!!preview} onClose={() => setPreview(null)} type="product.tube.catalogue" query={preview ?? undefined} />
    </div>
  );
}

function ModelCard({ m, name, place, busy, draftId, run, onApproved, onPreview }: { m: Model; name: string; place: string; busy: string; draftId: string | null; run: (label: string, fn: () => Promise<unknown>) => Promise<void>; onApproved?: () => void; onPreview: () => void }) {
  const start = m.mounting ?? m.suggested ?? null;
  const [axis, setAxis] = useState<Axis>(start?.axis ?? "-Y");
  const [anchor, setAnchor] = useState<[number, number, number]>(start?.anchorMm ?? topCentre(m, start?.axis ?? "-Y"));
  const [neck, setNeck] = useState<number | "">(start?.neckDiameterMm ?? "");
  const [thread, setThread] = useState(m.mounting?.thread ?? "");
  const st = STATUS[m.status];
  const s = m.suggested;
  const saved = !!m.mounting && m.mounting.axis === axis && m.mounting.anchorMm.every((v, i) => v === anchor[i]) && m.mounting.neckDiameterMm === neck && (m.mounting.thread ?? "") === thread;
  const body = { axis, anchorMm: anchor, neckDiameterMm: neck, ...(thread ? { thread } : {}) };
  const approve = () =>
    run("approve", async () => {
      if (!saved) await api(`/v1/manage/catalogue/tube/models/${m.id}/mounting`, { method: "PUT", body });
      await api(`/v1/manage/catalogue/tube/models/${m.id}/approve`, { body: { base_revision_id: draftId } });
      onApproved?.();
    });

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="row" style={{ gap: 8 }}>
          <CubeTransparent size={18} aria-hidden /> {name} · {place} · <span dir="ltr">{m.source_name}</span>
        </h3>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>
      <div className="card-body stack">
        <p className="small">
          ابعاد: <span dir="ltr">{m.bbox.size.map(mm).join(" × ")} mm</span> · {num(m.triangles)} مثلث · {num(m.parts)} قطعه
          {m.simplified && <span className="badge" style={{ marginInlineStart: 6 }}>ساده‌سازی‌شده برای وب</span>} ·{" "}
          <a href={m.url} download={`${m.closure_id}.glb`}>
            دریافت GLB
          </a>
        </p>
        {s ? (
          <div className={`note ${s.confidence === "high" ? "ok" : "warn"} row`}>
            <span style={{ flex: 1 }}>
              {s.confidence === "high" ? "پیشنهاد مطمئن از هندسه" : "پیشنهاد از هندسه؛ در پیش‌نمایش بررسی کنید"}: دهانه رو به <code>{s.axis}</code>، قطر گلو <span dir="ltr">{mm(s.neckDiameterMm)} mm</span>، نقطهٔ اتصال <span dir="ltr">({s.anchorMm.map(mm).join("، ")})</span>
            </span>
            <button
              type="button"
              className="btn sm"
              disabled={m.status === "archived"}
              onClick={() => {
                setAxis(s.axis);
                setAnchor(s.anchorMm);
                setNeck(s.neckDiameterMm);
              }}
            >
              استفاده از پیشنهاد
            </button>
          </div>
        ) : (
          <p className="note warn small">دهانه‌ای در هندسه پیدا نشد (قطعهٔ توپر یا باز از دو طرف). محل اتصال را دستی تنظیم کنید.</p>
        )}
        <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }} disabled={m.status === "archived"}>
          <legend className="small" style={{ fontWeight: 600 }}>
            محل اتصال روی گلوی تیوب
          </legend>
          <div className="row" style={{ gap: 12, alignItems: "end" }}>
            <label className="stack" style={{ gap: 4 }}>
              <span>جهت دهانه (به سمت تیوب)</span>
              <select dir="ltr" value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
                {AXES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            {(["X", "Y", "Z"] as const).map((k, i) => (
              <label key={k} className="stack" style={{ gap: 4 }}>
                <span>نقطهٔ اتصال {k} (mm)</span>
                <input type="number" dir="ltr" step="any" style={{ maxInlineSize: 110 }} value={anchor[i]} onChange={(e) => setAnchor((a) => a.map((v, j) => (j === i ? Number(e.target.value) : v)) as [number, number, number])} />
              </label>
            ))}
            <button type="button" className="btn ghost small" onClick={() => setAnchor(topCentre(m, axis))}>
              پیشنهاد از ابعاد
            </button>
          </div>
          <p className="small muted">نقطهٔ اتصال جایی درون درب است که لبهٔ بالای گلوی تیوب به آن می‌رسد (سقف داخلی درب).</p>
          <div className="row" style={{ gap: 12, alignItems: "end" }}>
            <label className="stack" style={{ gap: 4 }}>
              <span>قطر گلو (mm)</span>
              <input type="number" dir="ltr" step="any" min={1} max={120} style={{ maxInlineSize: 110 }} value={neck} onChange={(e) => setNeck(e.target.value === "" ? "" : Number(e.target.value))} />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span>رزوه (اختیاری)</span>
              <input dir="ltr" style={{ maxInlineSize: 140 }} value={thread} maxLength={60} onChange={(e) => setThread(e.target.value)} />
            </label>
            <button type="button" className="btn" disabled={!neck || !!busy || saved} onClick={() => run("mount", () => api(`/v1/manage/catalogue/tube/models/${m.id}/mounting`, { method: "PUT", body }))}>
              ذخیرهٔ محل اتصال
            </button>
          </div>
        </fieldset>
        <div className="row">
          {m.status !== "approved" && m.status !== "archived" && (
            <button type="button" className="btn primary" disabled={!neck || !!busy} onClick={approve}>
              <CheckCircle size={18} aria-hidden /> تأیید و استفاده برای {place === "همهٔ قطرها" ? "این درب" : place}
            </button>
          )}
          {m.status === "approved" && (
            <button type="button" className="btn ghost" onClick={onPreview}>
              <Eye size={18} aria-hidden /> پیش‌نمایش روی سایت (پیش‌نویس)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
