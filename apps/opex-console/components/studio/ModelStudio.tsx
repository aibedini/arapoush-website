"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Finish, Look, ModelInfo, Mount, StudioScene, View } from "./studioScene";

export type StudioHandle = { snapshot: () => string | null; select: (i: number | null) => void };
export const FINISHES: { id: Finish; fa: string }[] = [
  { id: "cad", fa: "رنگ خود فایل" },
  { id: "matte", fa: "مات (پلاستیک)" },
  { id: "gloss", fa: "براق" },
  { id: "metal", fa: "فلز (متالایز)" },
  { id: "brushed", fa: "فلز برس‌خورده" },
  { id: "clear", fa: "شفاف رنگی" },
  { id: "glass", fa: "شیشه" },
];

type Props = {
  /** The part being edited; null when the part is the body itself (`base`). */
  url: string | null;
  mount: Mount | null;
  base?: { url: string; mount: Mount | null } | null;
  tubeDiameter?: number | null;
  look?: Look | null;
  title: string;
  badge?: string;
  busy?: string;
  onSelect?: (i: number | null) => void;
  onInfo?: (i: ModelInfo | null) => void;
};

/**
 * The 3D studio's stage: the model large, with the tools on it (turn, wireframe, floor and box,
 * background, half-section, lift, body, reset, save image). Three.js loads only when it opens.
 */
export const ModelStudio = forwardRef<StudioHandle, Props>(function ModelStudio({ url, mount, base, tubeDiameter, look, title, badge, busy, onSelect, onInfo }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<StudioScene | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [view, setView] = useState<View>({ section: false, lift: false, body: true, rotate: true, wire: false, grid: true, bg: 0 });
  const latest = useRef({ mount, base, tubeDiameter, look, view, onSelect, onInfo });
  latest.current = { mount, base, tubeDiameter, look, view, onSelect, onInfo };

  useImperativeHandle(ref, () => ({ snapshot: () => scene.current?.snapshot() ?? null, select: (i) => scene.current?.select(i) }), []);

  useEffect(() => {
    let s: StudioScene | null = null;
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const { StudioScene } = await import("./studioScene");
        if (cancelled) return;
        s = new StudioScene(canvas.current!);
        scene.current = s;
        s.onSelect = (i) => latest.current.onSelect?.(i);
        const l = latest.current;
        s.set({ mount: l.mount, tubeDiameter: l.tubeDiameter ?? null, look: l.look ?? null, view: l.view });
        await Promise.all([s.load(url), l.base ? s.loadBase(l.base.url, l.base.mount) : null]);
        if (cancelled) return;
        latest.current.onInfo?.(s.info());
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      s?.dispose();
      scene.current = null;
    };
  }, [url]);

  // Another body (or none) loads into the running scene.
  const baseUrl = base?.url ?? null;
  const ready = state === "ready";
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) return void (first.current = false);
    void scene.current?.loadBase(baseUrl, latest.current.base?.mount ?? null);
  }, [baseUrl, ready]);

  const key = JSON.stringify([mount, base?.mount ?? null, tubeDiameter ?? null, look ?? null, view]);
  useEffect(() => {
    const l = latest.current;
    scene.current?.set({ mount: l.mount, baseMount: l.base?.mount ?? null, tubeDiameter: l.tubeDiameter ?? null, look: l.look ?? null, view: l.view });
  }, [key]);

  const toggle = (k: "section" | "lift" | "body" | "rotate" | "wire" | "grid") => setView((v) => ({ ...v, [k]: !v[k] }));
  const save = () => {
    const png = scene.current?.snapshot();
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = `${title}.png`;
    a.click();
  };
  const T = ({ k, children }: { k: "section" | "lift" | "body" | "rotate" | "wire" | "grid"; children: string }) => (
    <button type="button" aria-pressed={view[k]} onClick={() => toggle(k)}>
      {children}
    </button>
  );

  return (
    <div className="wb-stage" role="group" aria-label={`نمای سه‌بعدی ${title}`}>
      <canvas ref={canvas} hidden={state === "failed"} aria-label={`مدل سه‌بعدی ${title}؛ برای چرخاندن بکشید و برای انتخاب قطعه کلیک کنید`} />
      {badge && <span className="wb-badge">{badge}</span>}
      {(state === "loading" || busy) && (
        <div className="wb-busy" role="status">
          {busy || "در حال بارگذاری مدل…"}
        </div>
      )}
      {state === "failed" && (
        <div className="wb-busy" role="alert">
          مدل باز نشد. صفحه را دوباره بارگذاری کنید؛ اگر باز هم نشد، فایل GLB را دریافت و بررسی کنید.
        </div>
      )}
      <div className="wb-toolbar">
        <T k="rotate">چرخش خودکار</T>
        <T k="wire">شبکه</T>
        <T k="grid">زمین و ابعاد</T>
        <button type="button" onClick={() => setView((v) => ({ ...v, bg: v.bg + 1 }))}>
          پس‌زمینه
        </button>
        <T k="section">برش نیم‌رخ</T>
        {url && <T k="lift">بلند کردن درب</T>}
        {url && <T k="body">{base ? "بدنه" : "گلوی نمونه"}</T>}
        <button type="button" disabled={!ready} onClick={() => scene.current?.reset()}>
          نمای اولیه
        </button>
        <button type="button" disabled={!ready} onClick={save}>
          ذخیرهٔ تصویر
        </button>
      </div>
    </div>
  );
});

/** Colour and finish for the whole part or the picked piece; used by the studio and the tube closures. */
export function LookPicker({ look, selected, onChange }: { look: Look | null; selected: number | null; onChange: (l: Look | null) => void }) {
  const own = selected != null ? look?.meshes?.find((m) => m.i === selected) : undefined;
  const [finish, setFinish] = useState<Finish>(own?.finish ?? look?.finish ?? "cad");
  const [hex, setHex] = useState(own?.hex ?? look?.hex ?? "#1d4a72");
  const apply = (target: "piece" | "all") => {
    if (finish === "cad") return onChange(target === "all" ? null : look ? { ...look, meshes: look.meshes?.filter((m) => m.i !== selected) } : null);
    if (target === "all") return onChange({ finish, hex, meshes: [] });
    const meshes = [...(look?.meshes ?? []).filter((m) => m.i !== selected), { i: selected!, finish, hex }];
    onChange({ finish: look?.finish ?? "matte", hex: look?.hex ?? "#d9dde1", ...look, meshes });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="small muted" style={{ margin: 0 }}>
        {selected != null ? `قطعهٔ ${selected + 1} انتخاب شده است.` : "روی یک قطعه در نمای سه‌بعدی کلیک کنید تا انتخاب شود. فایل‌های STEP معمولاً فقط شکل دارند و رنگ و جنس را اینجا تعیین می‌کنید."}
      </p>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <label className="row" style={{ gap: 6 }}>
          <span className="small">جنس</span>
          <select value={finish} onChange={(e) => setFinish(e.target.value as Finish)}>
            {FINISHES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fa}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <span className="small">رنگ</span>
          <input type="color" value={hex} disabled={finish === "cad"} onChange={(e) => setHex(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm" disabled={selected == null} onClick={() => apply("piece")}>
          اعمال روی قطعهٔ انتخاب‌شده
        </button>
        <button type="button" className="btn sm" onClick={() => apply("all")}>
          اعمال روی همه
        </button>
      </div>
    </div>
  );
}
