"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, FloppyDisk, UploadSimple } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { num } from "@/lib/fa";
import { LookPicker, ModelStudio, type StudioHandle } from "./ModelStudio";
import type { Axis, Look, ModelInfo, Mount } from "./studioScene";
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
  look?: Look | null;
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
type Run = (label: string, fn: () => Promise<unknown>) => Promise<void>;

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
const sameLook = (a?: Look | null, b?: Look | null) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/** A body's neck top, or a closure's inner ceiling, from the box alone: a starting point. */
function fromBox(p: Part, axis: Axis): [number, number, number] {
  const c = p.bbox.min.map((v, i) => (v + p.bbox.max[i]!) / 2) as [number, number, number];
  const i = { X: 0, Y: 1, Z: 2 }[axis[1] as "X" | "Y" | "Z"];
  c[i] = p.kind === "body" ? (axis[0] === "+" ? p.bbox.max[i]! : p.bbox.min[i]!) : axis[0] === "+" ? p.bbox.min[i]! : p.bbox.max[i]!;
  return c.map((v) => Math.round(v * 100) / 100) as [number, number, number];
}

/**
 * The 3D studio (S2): a workbench like the standalone prototype. The tools sit in a column beside a
 * large stage: upload STEP/GLB, pick the part of the line, name and categorise it, read its checks,
 * click pieces to give them colour and finish, seat a closure on a body of its line, compare with a
 * real photo, and approve it into `product.parts` for the site.
 */
export function PartsLibrary() {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [lines, setLines] = useState<Line[]>(KNOWN);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [line, setLine] = useState("effervescent");
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    const [list, entry] = await Promise.all([api<Part[]>("/v1/manage/catalogue/parts"), api<{ draft: { id: string; data: { lines?: Line[] } } | null }>("/v1/manage/entries/product.parts")]);
    setParts(list);
    setDraftId(entry.draft?.id ?? null);
    const known = new Map(KNOWN.map((l) => [l.id, l]));
    for (const l of entry.draft?.data.lines ?? []) known.set(l.id, l);
    for (const p of list) if (!known.has(p.line)) known.set(p.line, { id: p.line, name: { fa: p.line } });
    setLines([...known.values()]);
    return list;
  }, []);
  useEffect(() => {
    load().catch(setError);
  }, [load]);

  const run: Run = async (label, fn) => {
    setBusy(label);
    setError(null);
    setDone("");
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
  const part = here.find((p) => p.id === current) ?? here[0] ?? null;
  const lineName = (id: string) => lines.find((l) => l.id === id)?.name.fa ?? id;

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "end", gap: 12 }}>
        <label className="stack" style={{ gap: 4 }}>
          <span>لاین محصول</span>
          <select value={line} onChange={(e) => (setLine(e.target.value), setCurrent(null))}>
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
            setCurrent(null);
          }}
        />
      </div>
      {line === "tube" && <p className="note small">درب‌های تیوب چندلایه به کاتالوگ تیوب وصل‌اند و در «کاتالوگ تیوب ← مدل‌های سه‌بعدی» تأیید می‌شوند. بدنه و قطعه‌های دیگر تیوب را اینجا اضافه کنید.</p>}
      <ErrorNote error={error} />
      {done && (
        <p className="note ok" role="status">
          {done}
        </p>
      )}

      <div className="wb-grid">
        <div className="wb-col">
          <Upload
            line={line}
            lineName={lineName(line)}
            busy={busy}
            onUploaded={async (id) => {
              setCurrent(id);
              setDone("فایل تبدیل شد. نام، رنگ و اتصال را بررسی و بعد تأیید کنید.");
            }}
            run={run}
            setError={setError}
            reload={load}
          />
          <section className="wb-card" aria-labelledby="wb-list">
            <h2 id="wb-list">قطعه‌های {lineName(line)}</h2>
            {here.length === 0 ? (
              <p className="small muted">هنوز قطعه‌ای نیست. فایل STEP بدنه و درب را بالا بارگذاری کنید.</p>
            ) : (
              <ul className="wb-parts">
                {here.map((p) => (
                  <li key={p.id}>
                    <button type="button" aria-current={p.id === part?.id || undefined} onClick={() => setCurrent(p.id)}>
                      <span>
                        {KINDS[p.kind]}: {partName(p)}
                      </span>
                      <span className={`badge ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {part && <PartTools key={part.id} p={part} bodies={here.filter((b) => b.kind === "body" && b.id !== part.id)} busy={busy} draftId={draftId} run={run} onDone={setDone} />}
        </div>
        <div className="wb-col">{part ? <PartStage key={part.id} p={part} bodies={here.filter((b) => b.kind === "body" && b.id !== part.id)} /> : <div className="wb-stage wb-empty">فایل STEP یا GLB را در ستون کنار بارگذاری کنید تا اینجا سه‌بعدی ببینید.</div>}</div>
      </div>
    </div>
  );
}

/**
 * The edits of the current part live in one place so the stage and the tool cards stay in step:
 * the tool cards write them, the stage shows them before anything is saved.
 */
type Draft = { look: Look | null; mount: Mount | null; bodyId: string; selected: number | null; info: ModelInfo | null };
const drafts = new Map<string, Draft>();
const listeners = new Map<string, Set<() => void>>();
function useDraft(p: Part, bodies: Part[]): [Draft, (d: Partial<Draft>) => void] {
  if (!drafts.has(p.id)) {
    const s = p.mounting ?? p.suggested ?? null;
    drafts.set(p.id, { look: p.look ?? null, mount: s ? { axis: s.axis, anchorMm: s.anchorMm, neckDiameterMm: s.neckDiameterMm } : null, bodyId: bodies.find((b) => b.status === "approved")?.id ?? bodies[0]?.id ?? "", selected: null, info: null });
  }
  const [, force] = useState(0);
  useEffect(() => {
    const set = listeners.get(p.id) ?? new Set();
    const fn = () => force((n) => n + 1);
    set.add(fn);
    listeners.set(p.id, set);
    return () => void set.delete(fn);
  }, [p.id]);
  const update = (d: Partial<Draft>) => {
    drafts.set(p.id, { ...drafts.get(p.id)!, ...d });
    for (const fn of listeners.get(p.id) ?? []) fn();
  };
  return [drafts.get(p.id)!, update];
}

function PartStage({ p, bodies }: { p: Part; bodies: Part[] }) {
  const [d, set] = useDraft(p, bodies);
  const studio = useRef<StudioHandle>(null);
  const body = bodies.find((b) => b.id === d.bodyId);
  return (
    <>
      {p.kind === "body" ? (
        <ModelStudio ref={studio} url={null} title={p.id} badge={p.source_name} mount={null} base={{ url: p.url, mount: d.mount }} look={d.look} onInfo={(info) => set({ info })} />
      ) : (
        <ModelStudio
          ref={studio}
          url={p.url}
          title={p.id}
          badge={p.source_name}
          mount={d.mount}
          base={body ? { url: body.url, mount: body.mounting ?? body.suggested ?? null } : null}
          look={d.look}
          onSelect={(selected) => set({ selected })}
          onInfo={(info) => set({ info })}
        />
      )}
      <Compare snapshot={() => studio.current?.snapshot() ?? null} />
    </>
  );
}

/** Real photos beside the model, as in the prototype: turn the model to the photo's angle and capture. */
function Compare({ snapshot }: { snapshot: () => string | null }) {
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);
  return (
    <section className="wb-card" aria-labelledby="wb-cmp">
      <h2 id="wb-cmp">مقایسه با عکس واقعی</h2>
      <label className="cm-drop">
        <span>عکس‌های واقعی محصول را اضافه کنید</span>
        <span className="small muted">فقط در همین مرورگر نگه داشته می‌شوند و جایی بارگذاری نمی‌شوند.</span>
        <input
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          aria-label="انتخاب عکس‌های واقعی"
          onChange={(e) => {
            const next = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
            setPhotos((ps) => [...ps, ...next]);
            if (!photo && next[0]) setPhoto(next[0].url);
            e.target.value = "";
          }}
        />
      </label>
      {photos.length > 0 && (
        <>
          <div className="wb-photos">
            {photos.map((ph) => (
              <button key={ph.url} type="button" aria-pressed={photo === ph.url} onClick={() => setPhoto(ph.url)} aria-label={`مقایسه با ${ph.name}`}>
                { }
                <img src={ph.url} alt="" />
              </button>
            ))}
          </div>
          <div className="wb-compare">
            <figure>
              { }
              {photo && <img src={photo} alt="عکس واقعی" />}
              <figcaption>عکس واقعی</figcaption>
            </figure>
            <figure>
              { }
              {shot ? <img src={shot} alt="نمای مدل" /> : <div className="wb-shot-empty" />}
              <figcaption>نمای مدل</figcaption>
            </figure>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setShot(snapshot())}>
              ثبت نما از همین زاویه
            </button>
          </div>
        </>
      )}
    </section>
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

function Upload({ line, lineName, busy, run, onUploaded, setError, reload }: { line: string; lineName: string; busy: string; run: Run; onUploaded: (id: string) => void; setError: (e: ApiError | null) => void; reload: () => Promise<Part[]> }) {
  const [kind, setKind] = useState<Kind>("closure");
  const [unit, setUnit] = useState<"m" | "mm">("m");
  const [drag, setDrag] = useState(false);
  const [name, setName] = useState("");
  const send = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(step|stp|glb)$/i.test(f.name)) return setError(new ApiError(0, "CLIENT", "فقط STEP، STP و GLB پذیرفته می‌شود. فایل SolidWorks را با Save As → STEP خروجی بگیرید."));
    setName(f.name);
    const k = /body|bottle|jar|بدنه|ظرف/i.test(f.name) ? "body" : kind;
    void run("upload", async () => {
      const created = await api<Part>("/v1/manage/catalogue/parts", { body: { line, kind: k, name: { fa: f.name.replace(/\.(step|stp|glb)$/i, "") }, file_name: f.name, data: await toBase64(f), unit } });
      await reload();
      onUploaded(created.id);
    });
  };
  return (
    <section className="wb-card" aria-labelledby="wb-up">
      <h2 id="wb-up">۱. فایل سه‌بعدی برای {lineName}</h2>
      <label
        className="cm-drop"
        data-drag={drag || undefined}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          send(e.dataTransfer.files[0]);
        }}
      >
        <UploadSimple size={26} aria-hidden />
        <strong>{busy === "upload" ? `در حال تبدیل ${name}…` : "فایل را اینجا رها کنید یا کلیک کنید"}</strong>
        <span className="small muted">STEP، STP یا GLB · تا ۲۵ مگابایت · ابعاد دقیق از خود فایل</span>
        <input type="file" className="sr-only" accept=".step,.stp,.glb,model/gltf-binary" aria-label="انتخاب فایل STEP یا GLB" disabled={!!busy} onChange={(e) => (send(e.target.files?.[0]), (e.target.value = ""))} />
      </label>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <label className="row" style={{ gap: 6 }}>
          <span className="small">نوع قطعه</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KINDS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <span className="small">واحد GLB</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "mm")}>
            <option value="m">متر</option>
            <option value="mm">میلی‌متر</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function PartTools({ p, bodies, busy, draftId, run, onDone }: { p: Part; bodies: Part[]; busy: string; draftId: string | null; run: Run; onDone: (s: string) => void }) {
  const [d, set] = useDraft(p, bodies);
  const [kind, setKind] = useState<Kind>(p.kind);
  const [fa, setFa] = useState(p.name?.fa ?? "");
  const [en, setEn] = useState(p.name?.en ?? "");
  const [category, setCategory] = useState(p.category ?? "");
  const tubeClosure = !!p.closure_id;
  const m = d.mount;
  const metaSaved = (p.name?.fa ?? "") === fa && (p.name?.en ?? "") === en && (p.category ?? "") === category && p.kind === kind && sameLook(p.look, d.look);
  const mountSaved = !!p.mounting && !!m && p.mounting.axis === m.axis && p.mounting.anchorMm.every((v, i) => v === m.anchorMm[i]) && p.mounting.neckDiameterMm === m.neckDiameterMm;
  const saveMeta = () => api(`/v1/manage/catalogue/parts/${p.id}`, { method: "PUT", body: { name: { ...(fa ? { fa } : {}), ...(en ? { en } : {}) }, category: category || null, ...(tubeClosure ? {} : { kind }), look: d.look } });
  const saveMount = () => api(`/v1/manage/catalogue/parts/${p.id}/mounting`, { method: "PUT", body: m });
  const setMount = (patch: Partial<Mount>) => set({ mount: { axis: m?.axis ?? (kind === "body" ? "+Y" : "-Y"), anchorMm: m?.anchorMm ?? fromBox(p, m?.axis ?? "-Y"), neckDiameterMm: m?.neckDiameterMm ?? 0, ...patch } });
  const approve = () =>
    run(`approve`, async () => {
      if (!metaSaved) await saveMeta();
      if (!mountSaved) await saveMount();
      await api(`/v1/manage/catalogue/parts/${p.id}/approve`, { body: { base_revision_id: draftId } });
      onDone("تأیید شد و در پیش‌نویس کتابخانهٔ قطعه‌ها ذخیره شد. برای دیده شدن در سایت، پیش‌نویس «product.parts» را در «محتوا» منتشر کنید.");
    });
  const s = p.suggested;
  const info = d.info;
  const checks: [string, string][] = [
    p.source_kind === "step" ? ["ok", "فایل CAD (STEP) است؛ ابعاد دقیق مهندسی از خود فایل آمده."] : ["ok", "فایل GLB است؛ ابعاد با واحدی که انتخاب کردید خوانده شد."],
    ["warn", "STEP فقط شکل دارد، نه رنگ و جنس. رنگ و جنس هر قطعه را در «رنگ و جنس» تعیین کنید."],
    p.triangles > 500_000 ? ["bad", "بیش از ۵۰۰ هزار مثلث؛ در موبایل کند می‌شود."] : p.triangles > 150_000 ? ["warn", "تعداد مثلث‌ها زیاد است؛ روی موبایل‌های ضعیف ممکن است کند باشد."] : ["ok", "تعداد مثلث‌ها برای سایت و موبایل مناسب است."],
    s ? [s.confidence === "high" ? "ok" : "warn", `دهانه از روی هندسه پیدا شد (${s.confidence === "high" ? "مطمئن" : "نیاز به بررسی"}): رو به ${s.axis}، قطر گلو ${mm(s.neckDiameterMm)} میلی‌متر.`] : ["warn", "دهانه‌ای در هندسه پیدا نشد؛ جهت و محل اتصال را دستی تنظیم کنید."],
  ];

  if (tubeClosure)
    return (
      <section className="wb-card">
        <h2>درب تیوب</h2>
        <p className="note small">این درب به کاتالوگ تیوب وصل است؛ در «کاتالوگ تیوب ← مدل‌های سه‌بعدی» بررسی و تأیید کنید.</p>
      </section>
    );

  return (
    <>
      <section className="wb-card" aria-labelledby="wb-meta">
        <h2 id="wb-meta">۲. نام و دسته‌بندی</h2>
        <div className="wb-fields">
          <label>
            <span>نوع قطعه</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KINDS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>دسته‌بندی</span>
            <input dir="auto" value={category} maxLength={60} placeholder="spiral" onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label>
            <span>نام فارسی</span>
            <input value={fa} maxLength={120} onChange={(e) => setFa(e.target.value)} />
          </label>
          <label>
            <span>نام انگلیسی</span>
            <input dir="ltr" value={en} maxLength={120} onChange={(e) => setEn(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button type="button" className="btn sm" disabled={metaSaved || !!busy} onClick={() => run("meta", saveMeta)}>
            <FloppyDisk size={16} aria-hidden /> ذخیرهٔ نام، دسته و رنگ
          </button>
        </div>
      </section>

      <section className="wb-card" aria-labelledby="wb-info">
        <h2 id="wb-info">مشخصات مدل</h2>
        <dl className="wb-dl">
          <dt>فایل</dt>
          <dd>{p.source_name}</dd>
          <dt>فرمت</dt>
          <dd>{p.source_kind.toUpperCase()}</dd>
          <dt>مثلث‌ها</dt>
          <dd>{p.triangles.toLocaleString("en")}</dd>
          <dt>قطعه‌ها</dt>
          <dd>{info?.meshes ?? p.parts}</dd>
          <dt>ابعاد (mm)</dt>
          <dd>{p.bbox.size.map((v) => (Math.round(v * 10) / 10).toString()).join(" × ")}</dd>
          <dt>شناسه برای سایت</dt>
          <dd>{p.id}</dd>
        </dl>
        <ul className="wb-checks">
          {checks.map(([k, t]) => (
            <li key={t} className={k}>
              <span className="wb-dot" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <a className="small" href={p.url} download={`${p.id}.glb`}>
          دریافت GLB
        </a>
      </section>

      <section className="wb-card" aria-labelledby="wb-look">
        <h2 id="wb-look">۳. رنگ و جنس قطعه‌ها</h2>
        <LookPicker key={d.selected ?? "all"} look={d.look} selected={d.selected} onChange={(look) => set({ look })} />
        {!sameLook(p.look, d.look) && <p className="small muted">رنگ تازه هنوز ذخیره نشده است؛ با «ذخیرهٔ نام، دسته و رنگ» یا «تأیید» ذخیره می‌شود.</p>}
      </section>

      <section className="wb-card" aria-labelledby="wb-mount">
        <h2 id="wb-mount">۴. {kind === "body" ? "گلوی بدنه" : "اتصال به بدنه"}</h2>
        {kind !== "body" && (
          <label className="row" style={{ gap: 6 }}>
            <span className="small">بدنه برای پیش‌نمایش</span>
            <select value={d.bodyId} onChange={(e) => set({ bodyId: e.target.value })}>
              <option value="">گلوی نمونه</option>
              {bodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {partName(b)}
                </option>
              ))}
            </select>
          </label>
        )}
        {s && (
          <button type="button" className="btn sm" onClick={() => set({ mount: { axis: s.axis, anchorMm: s.anchorMm, neckDiameterMm: s.neckDiameterMm } })}>
            استفاده از پیشنهاد هندسه
          </button>
        )}
        <div className="wb-fields">
          <label>
            <span>{kind === "body" ? "جهت دهانه (رو به بیرون)" : "جهت دهانه (به سمت بدنه)"}</span>
            <select dir="ltr" value={m?.axis ?? (kind === "body" ? "+Y" : "-Y")} onChange={(e) => setMount({ axis: e.target.value as Axis })}>
              {AXES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            <span>قطر گلو (mm)</span>
            <input type="number" dir="ltr" step="any" min={1} max={120} value={m?.neckDiameterMm || ""} onChange={(e) => setMount({ neckDiameterMm: Number(e.target.value) })} />
          </label>
          {(["X", "Y", "Z"] as const).map((k, i) => (
            <label key={k}>
              <span>نقطهٔ اتصال {k} (mm)</span>
              <input
                type="number"
                dir="ltr"
                step="any"
                value={m?.anchorMm[i] ?? ""}
                onChange={(e) => {
                  const a = [...(m?.anchorMm ?? fromBox(p, m?.axis ?? "-Y"))] as [number, number, number];
                  a[i] = Number(e.target.value);
                  setMount({ anchorMm: a });
                }}
              />
            </label>
          ))}
        </div>
        <p className="small muted">{kind === "body" ? "نقطهٔ اتصال لبهٔ بالای گلوی بدنه است؛ درب‌ها همین‌جا می‌نشینند." : "نقطهٔ اتصال سقف داخلی درب است، جایی که لبهٔ گلو به آن می‌رسد. با «برش نیم‌رخ» روی صحنه بررسی کنید."}</p>
        <div className="row">
          <button type="button" className="btn sm ghost" onClick={() => setMount({ anchorMm: fromBox(p, m?.axis ?? (kind === "body" ? "+Y" : "-Y")) })}>
            پیشنهاد از ابعاد
          </button>
          <button type="button" className="btn sm" disabled={!m?.neckDiameterMm || mountSaved || !!busy} onClick={() => run("mount", saveMount)}>
            ذخیرهٔ اتصال
          </button>
        </div>
      </section>

      <section className="wb-card" aria-labelledby="wb-ok">
        <h2 id="wb-ok">۵. تأیید برای سایت</h2>
        <p className="small">
          وضعیت: <span className={`badge ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
        </p>
        {p.status === "approved" && (
          <p className="small muted">
            در ویرایشگر بصری، بلوک «محصول سه‌بعدی» را اضافه کنید و شناسهٔ <code dir="ltr">{p.id}</code> را در فیلد {kind === "body" ? "بدنه" : "درب"} بگذارید.
          </p>
        )}
        <button type="button" className="btn primary" disabled={!m?.neckDiameterMm || !!busy || (p.status === "approved" && metaSaved && mountSaved)} aria-busy={busy === "approve" || undefined} onClick={approve}>
          <CheckCircle size={18} aria-hidden /> {p.status === "approved" ? "ذخیرهٔ تغییرات و تأیید دوباره" : "تأیید و افزودن به سایت (پیش‌نویس)"}
        </button>
      </section>
    </>
  );
}
