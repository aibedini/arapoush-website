"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, CubeTransparent, Eye, UploadSimple } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { num } from "@/lib/fa";
import { PreviewFrames } from "./PreviewFrames";
import { ErrorNote, Loading } from "./ui";

type Axis = "+Y" | "-Y" | "+X" | "-X" | "+Z" | "-Z";
type Mounting = { axis: Axis; anchorMm: [number, number, number]; neckDiameterMm: number; thread?: string };
type Model = {
  id: string;
  closure_id: string;
  source_name: string;
  source_kind: "step" | "glb";
  status: "needs_review" | "approved" | "archived";
  url: string;
  bbox: { min: number[]; max: number[]; size: number[] };
  triangles: number;
  parts: number;
  simplified: boolean;
  mounting: Mounting | null;
  created_at: string;
};
type Closure = { id: string; name: { fa?: string; en?: string }; model3d?: { modelId?: string } };

const AXES: Axis[] = ["+Y", "-Y", "+X", "-X", "+Z", "-Z"];
const STATUS: Record<Model["status"], { label: string; cls: string }> = {
  needs_review: { label: "در انتظار بررسی", cls: "warn" },
  approved: { label: "تأییدشده", cls: "ok" },
  archived: { label: "بایگانی", cls: "" },
};
const mm = (n: number) => `${num(Math.round(n * 10) / 10)}`;

/** Centre of the bounding-box face the opening points to: a starting point the operator confirms. */
function suggestAnchor(m: Model, axis: Axis): [number, number, number] {
  const c = m.bbox.min.map((v, i) => (v + m.bbox.max[i]!) / 2) as [number, number, number];
  const i = { X: 0, Y: 1, Z: 2 }[axis[1] as "X" | "Y" | "Z"];
  c[i] = axis[0] === "+" ? m.bbox.max[i]! : m.bbox.min[i]!;
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
 * Factory CAD for closures (T2): upload STEP/STP or GLB, see what the conversion produced, set how
 * it sits on the neck, approve into the catalogue draft, then preview it on the website.
 */
export function ClosureModels() {
  const [closures, setClosures] = useState<Closure[] | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [closure, setClosure] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState<"m" | "mm">("m");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [entry, list] = await Promise.all([api<{ draft: { id: string; data: { closures: Closure[] } } | null }>("/v1/manage/entries/product.tube.catalogue"), api<Model[]>("/v1/manage/catalogue/tube/models")]);
    setClosures(entry.draft?.data.closures ?? []);
    setDraftId(entry.draft?.id ?? null);
    setModels(list);
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

  if (!closures) return <Loading rows={3} />;
  const nameOf = (id: string) => closures.find((c) => c.id === id)?.name.fa ?? id;
  const isStep = file ? /\.(step|stp)$/i.test(file.name) : false;

  return (
    <div className="stack">
      <p className="small muted">
        فایل صنعتی درب (STEP/STP) یا GLB را بارگذاری کنید. سامانه آن را به مدل وب بهینه با واحد میلی‌متر تبدیل می‌کند. تا وقتی محل اتصال (محور، نقطهٔ نشستن روی گلوی تیوب و قطر گلو) را تنظیم و تأیید نکنید، روی سایت نمی‌آید؛ مدل هرگز با حدس جاگذاری یا برای جا شدن کوچک و بزرگ نمی‌شود.
      </p>
      <div className="row" style={{ alignItems: "end", gap: 12 }}>
        <label className="stack" style={{ gap: 4 }}>
          <span>درب</span>
          <select value={closure} onChange={(e) => setClosure(e.target.value)}>
            <option value="">انتخاب کنید…</option>
            {closures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.fa ?? c.id}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>فایل (STEP، STP یا GLB؛ حداکثر ۲۵ مگابایت)</span>
          <input type="file" accept=".step,.stp,.glb,model/gltf-binary" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && !isStep && (
          <label className="stack" style={{ gap: 4 }}>
            <span>واحد فایل GLB</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "mm")}>
              <option value="m">متر (پیش‌فرض glTF)</option>
              <option value="mm">میلی‌متر</option>
            </select>
          </label>
        )}
        <button
          type="button"
          className="btn"
          disabled={!closure || !file || !!busy}
          aria-busy={busy === "upload" || undefined}
          onClick={() => run("upload", async () => api("/v1/manage/catalogue/tube/models", { body: { closure, name: file!.name, data: await toBase64(file!), unit } }))}
        >
          <UploadSimple size={18} aria-hidden /> {busy === "upload" ? "در حال تبدیل…" : "بارگذاری و تبدیل"}
        </button>
      </div>
      <ErrorNote error={error} />

      {models.length === 0 ? (
        <p className="small muted">هنوز مدلی بارگذاری نشده است. تا آن زمان درب‌ها با شکل پارامتریک نمایش داده می‌شوند.</p>
      ) : (
        models.map((m) => <ModelCard key={m.id} m={m} name={nameOf(m.closure_id)} busy={busy} draftId={draftId} run={run} onPreview={() => setPreview(m.closure_id)} />)
      )}
      <PreviewFrames open={!!preview} onClose={() => setPreview(null)} type="product.tube.catalogue" query={preview ? `cap=${preview}` : undefined} />
    </div>
  );
}

function ModelCard({ m, name, busy, draftId, run, onPreview }: { m: Model; name: string; busy: string; draftId: string | null; run: (label: string, fn: () => Promise<unknown>) => Promise<void>; onPreview: () => void }) {
  const [axis, setAxis] = useState<Axis>(m.mounting?.axis ?? "+Y");
  const [anchor, setAnchor] = useState<[number, number, number]>(m.mounting?.anchorMm ?? suggestAnchor(m, m.mounting?.axis ?? "+Y"));
  const [neck, setNeck] = useState<number | "">(m.mounting?.neckDiameterMm ?? "");
  const [thread, setThread] = useState(m.mounting?.thread ?? "");
  const st = STATUS[m.status];
  const saved = m.mounting && m.mounting.axis === axis && m.mounting.anchorMm.every((v, i) => v === anchor[i]) && m.mounting.neckDiameterMm === neck && (m.mounting.thread ?? "") === thread;

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="row" style={{ gap: 8 }}>
          <CubeTransparent size={18} aria-hidden /> {name} · <span dir="ltr">{m.source_name}</span>
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
            <button type="button" className="btn ghost small" onClick={() => setAnchor(suggestAnchor(m, axis))}>
              پیشنهاد از ابعاد
            </button>
          </div>
          <div className="row" style={{ gap: 12, alignItems: "end" }}>
            <label className="stack" style={{ gap: 4 }}>
              <span>قطر گلو (mm)</span>
              <input type="number" dir="ltr" step="any" min={1} max={120} style={{ maxInlineSize: 110 }} value={neck} onChange={(e) => setNeck(e.target.value === "" ? "" : Number(e.target.value))} />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span>رزوه (اختیاری)</span>
              <input dir="ltr" style={{ maxInlineSize: 140 }} value={thread} maxLength={60} onChange={(e) => setThread(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn"
              disabled={!neck || !!busy || !!saved}
              onClick={() => run("mount", () => api(`/v1/manage/catalogue/tube/models/${m.id}/mounting`, { method: "PUT", body: { axis, anchorMm: anchor, neckDiameterMm: neck, ...(thread ? { thread } : {}) } }))}
            >
              ذخیرهٔ محل اتصال
            </button>
          </div>
        </fieldset>
        <div className="row">
          {m.status !== "approved" && (
            <button type="button" className="btn" disabled={!m.mounting || !saved || !!busy} onClick={() => run("approve", () => api(`/v1/manage/catalogue/tube/models/${m.id}/approve`, { body: { base_revision_id: draftId } }))}>
              <CheckCircle size={18} aria-hidden /> تأیید و استفاده برای این درب
            </button>
          )}
          {m.status === "approved" && (
            <button type="button" className="btn ghost" onClick={onPreview}>
              <Eye size={18} aria-hidden /> پیش‌نمایش روی سایت (پیش‌نویس)
            </button>
          )}
          {!m.mounting && <span className="small muted">برای تأیید، اول محل اتصال را ذخیره کنید.</span>}
        </div>
      </div>
    </div>
  );
}
