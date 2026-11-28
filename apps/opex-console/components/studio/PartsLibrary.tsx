"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Cube, CubeTransparent, FloppyDisk, UploadSimple } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { num } from "@/lib/fa";
import { ModelStudio } from "./ModelStudio";
import type { Axis, Mount } from "./studioScene";
import { ErrorNote, Loading } from "../ui";

type Kind = "body" | "closure" | "insert";
type Loc = { fa?: string; en?: string; tr?: string };
type Suggested = Mount & { confidence: "high" | "low" };
export type Part = {
  id: string;
  line: string;
  kind: Kind;
  name: Loc | null;
  category: string | null;
  closure_id: string | null;
  source_name: string;
  source_kind: "step" | "glb";
  status: "needs_review" | "approved" | "archived";
  url: string;
  bbox: { min: number[]; max: number[]; size: number[] };
  triangles: number;
  parts: number;
  simplified: boolean;
  mounting: (Mount & { thread?: string }) | null;
  suggested?: Suggested | null;
};
type Line = { id: string; name: Loc };

const AXES: Axis[] = ["+Y", "-Y", "+X", "-X", "+Z", "-Z"];
export const KINDS: Record<Kind, string> = { body: "بدنه", closure: "درب", insert: "قطعهٔ داخلی" };
const STATUS: Record<Part["status"], { label: string; cls: string }> = {
  needs_review: { label: "در انتظار بررسی", cls: "warn" },
  approved: { label: "تأییدشده", cls: "ok" },
  archived: { label: "بایگانی", cls: "" },
};
/** Lines the library knows before any part is approved; others are added by typing an id. */
const KNOWN: Line[] = [
  { id: "tube", name: { fa: "تیوب چندلایه" } },
  { id: "effervescent", name: { fa: "تیوب قرص جوشان" } },
  { id: "jar", name: { fa: "ظرف‌ها" } },
];
const LINE_ID = /^[a-z][a-z0-9-]{0,31}$/;
const mm = (n: number) => `${num(Math.round(n * 10) / 10)}`;
const partName = (p: Part) => p.name?.fa || p.name?.en || p.source_name;

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/** Where a body's neck top or a closure's inner ceiling is, from the box alone: a starting point. */
function fromBox(p: Part, axis: Axis): [number, number, number] {
  const c = p.bbox.min.map((v, i) => (v + p.bbox.max[i]!) / 2) as [number, number, number];
  const i = { X: 0, Y: 1, Z: 2 }[axis[1] as "X" | "Y" | "Z"];
  // A closure's axis points into it from the opening, so its ceiling is the far face; a body's mouth is the face the axis points to.
  c[i] = p.kind === "body" ? (axis[0] === "+" ? p.bbox.max[i]! : p.bbox.min[i]!) : axis[0] === "+" ? p.bbox.min[i]! : p.bbox.max[i]!;
  return c.map((v) => Math.round(v * 100) / 100) as [number, number, number];
}

/**
 * The 3D studio's parts library (S2): factory STEP or GLB for every product line, as bodies,
 * closures and inserts with names and categories. Each part is checked in the studio (a closure
 * on a chosen body of its line, a body on its own with its neck marked), mounted and approved into
 * `product.parts`, which the site's 3D blocks read. Tube closures keep their catalogue page.
 */
export function PartsLibrary() {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [lines, setLines] = useState<Line[]>(KNOWN);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [line, setLine] = useState("effervescent");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const [list, entry] = await Promise.all([api<Part[]>("/v1/manage/catalogue/parts"), api<{ draft: { id: string; data: { lines?: Line[] } } | null }>("/v1/manage/entries/product.parts")]);
    setParts(list);
    setDraftId(entry.draft?.id ?? null);
    const known = new Map(KNOWN.map((l) => [l.id, l]));
    for (const l of entry.draft?.data.lines ?? []) known.set(l.id, l);
    for (const p of list) if (!known.has(p.line)) known.set(p.line, { id: p.line, name: { fa: p.line } });
    setLines([...known.values()]);
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

  if (!parts) return error ? <ErrorNote error={error} /> : <Loading rows={4} />;
  const here = parts.filter((p) => p.line === line);
  const bodies = here.filter((p) => p.kind === "body");
  const lineName = (id: string) => lines.find((l) => l.id === id)?.name.fa ?? id;

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "end", gap: 12 }}>
        <label className="stack" style={{ gap: 4 }}>
          <span>لاین محصول</span>
          <select value={line} onChange={(e) => setLine(e.target.value)}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name.fa ?? l.id} ({num(parts.filter((p) => p.line === l.id).length)})
              </option>
            ))}
          </select>
        </label>
        <NewLine
          onAdd={(id) => {
            if (!lines.some((l) => l.id === id)) setLines((ls) => [...ls, { id, name: { fa: id } }]);
            setLine(id);
          }}
        />
      </div>
      {line === "tube" && <p className="note small">درب‌های تیوب چندلایه به کاتالوگ تیوب وصل‌اند و در «کاتالوگ تیوب ← مدل‌های سه‌بعدی» تأیید می‌شوند. بدنه و قطعه‌های دیگر تیوب را اینجا اضافه کنید.</p>}

      <Upload line={line} lineName={lineName(line)} busy={busy} run={run} />
      <ErrorNote error={error} />

      {here.length === 0 ? (
        <p className="small muted">در این لاین هنوز قطعه‌ای نیست. فایل STEP بدنه و درب را بالا بارگذاری کنید.</p>
      ) : (
        here.map((p) => <PartCard key={p.id} p={p} bodies={bodies.filter((b) => b.id !== p.id)} busy={busy} draftId={draftId} run={run} />)
      )}
    </div>
  );
}

function NewLine({ onAdd }: { onAdd: (id: string) => void }) {
  const [id, setId] = useState("");
  const ok = LINE_ID.test(id);
  return (
    <form
      className="row"
      style={{ alignItems: "end", gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onAdd(id);
        setId("");
      }}
    >
      <label className="stack" style={{ gap: 4 }}>
        <span>لاین تازه (شناسهٔ لاتین)</span>
        <input dir="ltr" value={id} placeholder="jar-cosmetic" maxLength={32} aria-invalid={(!!id && !ok) || undefined} onChange={(e) => setId(e.target.value.toLowerCase())} />
      </label>
      <button type="submit" className="btn" disabled={!ok}>
        افزودن لاین
      </button>
    </form>
  );
}

function Upload({ line, lineName, busy, run }: { line: string; lineName: string; busy: string; run: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>("closure");
  const [fa, setFa] = useState("");
  const [en, setEn] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState<"m" | "mm">("m");
  const [drag, setDrag] = useState(false);
  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    if (!fa) setFa(f.name.replace(/\.(step|stp|glb)$/i, ""));
    if (/body|bottle|jar|بدنه|تیوب/i.test(f.name)) setKind("body");
  };
  const glb = !!file && /\.glb$/i.test(file.name);
  const okFile = !!file && /\.(step|stp|glb)$/i.test(file.name);
  const send = () =>
    run("upload", async () => {
      await api("/v1/manage/catalogue/parts", {
        body: { line, kind, name: { ...(fa ? { fa } : {}), ...(en ? { en } : {}) }, ...(category ? { category } : {}), file_name: file!.name, data: await toBase64(file!), unit },
      });
      setFile(null);
      setFa("");
      setEn("");
    });

  return (
    <div className="card">
      <div className="card-head">
        <h3>افزودن قطعه به {lineName}</h3>
      </div>
      <div className="card-body stack">
        <label
          className="cm-drop"
          data-drag={drag || undefined}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <UploadSimple size={28} aria-hidden />
          <span dir="auto">{file ? file.name : "فایل STEP، STP یا GLB را اینجا رها کنید یا کلیک کنید"}</span>
          <span className="small muted">{file ? `${mm(file.size / 1048576)} MB` : "تا ۲۵ مگابایت · فایل SolidWorks را با Save As → STEP خروجی بگیرید"}</span>
          <input type="file" className="sr-only" accept=".step,.stp,.glb,model/gltf-binary" aria-label="انتخاب فایل STEP یا GLB" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
        </label>
        {file && !okFile && <p className="note warn small">فقط STEP، STP و GLB پذیرفته می‌شود.</p>}
        <div className="row" style={{ gap: 12, alignItems: "end" }}>
          <label className="stack" style={{ gap: 4 }}>
            <span>نوع قطعه</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KINDS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>نام فارسی</span>
            <input value={fa} maxLength={120} onChange={(e) => setFa(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>نام انگلیسی</span>
            <input dir="ltr" value={en} maxLength={120} onChange={(e) => setEn(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>دسته‌بندی</span>
            <input dir="auto" value={category} maxLength={60} placeholder="spiral" onChange={(e) => setCategory(e.target.value)} />
          </label>
          {glb && (
            <label className="stack" style={{ gap: 4 }}>
              <span>واحد GLB</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "mm")}>
                <option value="m">متر</option>
                <option value="mm">میلی‌متر</option>
              </select>
            </label>
          )}
          <button type="button" className="btn primary" disabled={!okFile || !!busy} aria-busy={busy === "upload" || undefined} onClick={send}>
            <UploadSimple size={18} aria-hidden /> {busy === "upload" ? "در حال تبدیل…" : "بارگذاری و تبدیل"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartCard({ p, bodies, busy, draftId, run }: { p: Part; bodies: Part[]; busy: string; draftId: string | null; run: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const start = p.mounting ?? p.suggested ?? null;
  const [axis, setAxis] = useState<Axis>(start?.axis ?? (p.kind === "body" ? "+Y" : "-Y"));
  const [anchor, setAnchor] = useState<[number, number, number]>(start?.anchorMm ?? fromBox(p, start?.axis ?? (p.kind === "body" ? "+Y" : "-Y")));
  const [neck, setNeck] = useState<number | "">(start?.neckDiameterMm ?? "");
  const [fa, setFa] = useState(p.name?.fa ?? "");
  const [en, setEn] = useState(p.name?.en ?? "");
  const [category, setCategory] = useState(p.category ?? "");
  const [studio, setStudio] = useState(false);
  const [bodyId, setBodyId] = useState(bodies.find((b) => b.status === "approved")?.id ?? bodies[0]?.id ?? "");
  const st = STATUS[p.status];
  const tubeClosure = !!p.closure_id;
  const mount: Mount | null = neck ? { axis, anchorMm: anchor, neckDiameterMm: Number(neck) } : null;
  const savedMount = !!p.mounting && p.mounting.axis === axis && p.mounting.anchorMm.every((v, i) => v === anchor[i]) && p.mounting.neckDiameterMm === neck;
  const savedMeta = (p.name?.fa ?? "") === fa && (p.name?.en ?? "") === en && (p.category ?? "") === category;
  const body = bodies.find((b) => b.id === bodyId);
  const saveMeta = () => api(`/v1/manage/catalogue/parts/${p.id}`, { method: "PUT", body: { name: { ...(fa ? { fa } : {}), ...(en ? { en } : {}) }, category: category || null } });
  const approve = () =>
    run(`approve-${p.id}`, async () => {
      if (!savedMeta) await saveMeta();
      if (!savedMount) await api(`/v1/manage/catalogue/parts/${p.id}/mounting`, { method: "PUT", body: mount });
      await api(`/v1/manage/catalogue/parts/${p.id}/approve`, { body: { base_revision_id: draftId } });
    });

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="row" style={{ gap: 8 }}>
          <CubeTransparent size={18} aria-hidden /> {KINDS[p.kind]}: {partName(p)}
          {p.category && <span className="badge">{p.category}</span>}
        </h3>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>
      <div className="card-body stack">
        <p className="small">
          <span dir="ltr">{p.source_name}</span> · ابعاد <span dir="ltr">{p.bbox.size.map(mm).join(" × ")} mm</span> · {num(p.triangles)} مثلث
          {p.simplified && <span className="badge" style={{ marginInlineStart: 6 }}>ساده‌سازی‌شده برای وب</span>} ·{" "}
          <a href={p.url} download={`${p.id}.glb`}>
            دریافت GLB
          </a>
          {p.status === "approved" && (
            <>
              {" · "}شناسه برای بلوک «محصول سه‌بعدی»: <code dir="ltr">{p.id}</code>
            </>
          )}
        </p>
        {tubeClosure ? (
          <p className="note small">این درب به کاتالوگ تیوب وصل است؛ در «کاتالوگ تیوب ← مدل‌های سه‌بعدی» بررسی و تأیید کنید.</p>
        ) : (
          <>
            <div className="row" style={{ gap: 12, alignItems: "end" }}>
              <label className="stack" style={{ gap: 4 }}>
                <span>نام فارسی</span>
                <input value={fa} maxLength={120} onChange={(e) => setFa(e.target.value)} />
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span>نام انگلیسی</span>
                <input dir="ltr" value={en} maxLength={120} onChange={(e) => setEn(e.target.value)} />
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span>دسته‌بندی</span>
                <input dir="auto" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} />
              </label>
              <button type="button" className="btn" disabled={savedMeta || !!busy} onClick={() => run(`meta-${p.id}`, saveMeta)}>
                <FloppyDisk size={18} aria-hidden /> ذخیرهٔ نام و دسته
              </button>
            </div>

            {p.suggested ? (
              <div className={`note ${p.suggested.confidence === "high" ? "ok" : "warn"} row`}>
                <span style={{ flex: 1 }}>
                  پیشنهاد از هندسه: {p.kind === "body" ? "دهانه رو به" : "دهانهٔ درب رو به"} <code>{p.suggested.axis}</code>، قطر گلو <span dir="ltr">{mm(p.suggested.neckDiameterMm)} mm</span>
                </span>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setAxis(p.suggested!.axis);
                    setAnchor(p.suggested!.anchorMm);
                    setNeck(p.suggested!.neckDiameterMm);
                  }}
                >
                  استفاده از پیشنهاد
                </button>
              </div>
            ) : (
              <p className="note warn small">دهانه‌ای در هندسه پیدا نشد. جهت و نقطهٔ اتصال را دستی تنظیم کنید و در استودیو ببینید.</p>
            )}

            <div className="row">
              <button type="button" className="btn" aria-expanded={studio} onClick={() => setStudio((v) => !v)}>
                <Cube size={18} aria-hidden /> {studio ? "بستن استودیو سه‌بعدی" : p.kind === "body" ? "استودیو سه‌بعدی: بدنه و گلو" : "استودیو سه‌بعدی: روی بدنه"}
              </button>
              {studio && p.kind !== "body" && bodies.length > 0 && (
                <label className="row" style={{ gap: 6 }}>
                  <span className="small">بدنه</span>
                  <select value={bodyId} onChange={(e) => setBodyId(e.target.value)}>
                    <option value="">گلوی نمونه</option>
                    {bodies.map((b) => (
                      <option key={b.id} value={b.id}>
                        {partName(b)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {studio &&
              (p.kind === "body" ? (
                <ModelStudio url={null} title={p.id} mount={null} base={{ url: p.url, mount }} />
              ) : (
                <ModelStudio url={p.url} title={p.id} mount={mount} base={body ? { url: body.url, mount: body.mounting ?? body.suggested ?? null } : null} />
              ))}

            <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 600 }}>
                {p.kind === "body" ? "گلوی بدنه" : "محل اتصال روی گلو"}
              </legend>
              <div className="row" style={{ gap: 12, alignItems: "end" }}>
                <label className="stack" style={{ gap: 4 }}>
                  <span>{p.kind === "body" ? "جهت دهانه (رو به بیرون)" : "جهت دهانه (به سمت بدنه)"}</span>
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
                <button type="button" className="btn ghost small" onClick={() => setAnchor(fromBox(p, axis))}>
                  پیشنهاد از ابعاد
                </button>
                <label className="stack" style={{ gap: 4 }}>
                  <span>قطر گلو (mm)</span>
                  <input type="number" dir="ltr" step="any" min={1} max={120} style={{ maxInlineSize: 110 }} value={neck} onChange={(e) => setNeck(e.target.value === "" ? "" : Number(e.target.value))} />
                </label>
              </div>
              <p className="small muted">{p.kind === "body" ? "نقطهٔ اتصال لبهٔ بالای گلوی بدنه است؛ درب‌ها همین‌جا می‌نشینند." : "نقطهٔ اتصال سقف داخلی درب است، جایی که لبهٔ گلو به آن می‌رسد."}</p>
            </fieldset>
            <div className="row">
              <button type="button" className="btn" disabled={!mount || savedMount || !!busy} onClick={() => run(`mount-${p.id}`, () => api(`/v1/manage/catalogue/parts/${p.id}/mounting`, { method: "PUT", body: mount }))}>
                ذخیرهٔ محل اتصال
              </button>
              {p.status !== "approved" && (
                <button type="button" className="btn primary" disabled={!mount || !!busy} aria-busy={busy === `approve-${p.id}` || undefined} onClick={approve}>
                  <CheckCircle size={18} aria-hidden /> تأیید و افزودن به سایت (پیش‌نویس)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
