"use client";

import { useEffect, useRef, useState } from "react";
import type { Finish, Mount, StudioLook, StudioScene } from "./studioScene";

const FINISHES: { id: Finish; fa: string }[] = [
  { id: "cad", fa: "رنگ فایل" },
  { id: "white", fa: "سفید" },
  { id: "colour", fa: "رنگی" },
  { id: "clear", fa: "شفاف" },
  { id: "silver", fa: "متالایز نقره‌ای" },
  { id: "gold", fa: "متالایز طلایی" },
];

/**
 * The 3D studio for one factory part, before it is approved: the converted model seated on a tube
 * neck by the mounting being edited (it follows every change), with a half-section to check the neck
 * sits inside the cap, the site's cap finishes and a lift to see the neck. Three.js loads only when
 * the studio is opened.
 */
export function ModelStudio({ url, mount, tubeDiameter, title, base }: { url: string | null; mount: Mount | null; tubeDiameter?: number | null; title: string; base?: { url: string; mount: Mount | null } | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<StudioScene | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [look, setLook] = useState<StudioLook>({ finish: "cad", hex: "#1d4a72", bodyHex: "#f4f6f8", section: false, lift: false, body: true });
  const latest = useRef({ mount, tubeDiameter, look, base });
  latest.current = { mount, tubeDiameter, look, base };

  useEffect(() => {
    let s: StudioScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { StudioScene } = await import("./studioScene");
        if (cancelled) return;
        s = new StudioScene(canvas.current!);
        scene.current = s;
        const l = latest.current;
        s.set(l.mount, l.tubeDiameter ?? null, l.look);
        await s.load(url);
        if (!cancelled) setState("ready");
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

  // A different body, or none: load it into the running scene.
  const baseUrl = base?.url ?? null;
  const ready = state === "ready";
  useEffect(() => {
    if (ready) void scene.current?.loadBase(baseUrl, latest.current.base?.mount ?? null);
  }, [baseUrl, ready]);
  const baseMountKey = JSON.stringify(base?.mount ?? null);
  useEffect(() => {
    scene.current?.setBaseMount(latest.current.base?.mount ?? null);
  }, [baseMountKey]);

  const mountKey = JSON.stringify(mount);
  useEffect(() => {
    scene.current?.set(mount, tubeDiameter ?? null, look);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mountKey stands for mount by value
  }, [mountKey, tubeDiameter, look]);

  const toggle = (k: "section" | "lift" | "body") => setLook((v) => ({ ...v, [k]: !v[k] }));
  const save = () => {
    const url = scene.current?.snapshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.png`;
    a.click();
  };

  return (
    <div className="studio">
      <div className="studio-stage" role="img" aria-label={`نمای سه‌بعدی ${title}`}>
        <canvas ref={canvas} hidden={state === "failed"} />
        {state === "loading" && (
          <p className="studio-note small" role="status">
            در حال بارگذاری مدل…
          </p>
        )}
        {state === "failed" && <p className="studio-note small">مدل در این مرورگر نمایش داده نشد. فایل GLB را دریافت و بررسی کنید.</p>}
      </div>
      <div className="studio-tools">
        <div className="row" role="group" aria-label="ابزار نما">
          <button type="button" className="btn sm" aria-pressed={look.section} onClick={() => toggle("section")}>
            برش نیم‌رخ
          </button>
          <button type="button" className="btn sm" aria-pressed={look.lift} onClick={() => toggle("lift")}>
            بلند کردن درب
          </button>
          <button type="button" className="btn sm" aria-pressed={look.body} onClick={() => toggle("body")}>
            {base ? "نمایش بدنه" : "گلو و بدنهٔ تیوب"}
          </button>
          <button type="button" className="btn sm ghost" disabled={state !== "ready"} onClick={() => scene.current?.frame()}>
            نمای اولیه
          </button>
          <button type="button" className="btn sm ghost" disabled={state !== "ready"} onClick={save}>
            ذخیرهٔ تصویر
          </button>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <label className="row" style={{ gap: 6 }}>
            <span className="small">رنگ و جنس درب</span>
            <select value={look.finish} onChange={(e) => setLook((v) => ({ ...v, finish: e.target.value as Finish }))}>
              {FINISHES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fa}
                </option>
              ))}
            </select>
          </label>
          {(look.finish === "colour" || look.finish === "clear") && (
            <label className="row" style={{ gap: 6 }}>
              <span className="small">رنگ درب</span>
              <input type="color" value={look.hex} onChange={(e) => setLook((v) => ({ ...v, hex: e.target.value }))} />
            </label>
          )}
          <label className="row" style={{ gap: 6 }}>
            <span className="small">رنگ بدنه</span>
            <input type="color" value={look.bodyHex} onChange={(e) => setLook((v) => ({ ...v, bodyHex: e.target.value }))} />
          </label>
        </div>
        <p className="small muted">
          حلقهٔ نارنجی لبهٔ بالای گلوی تیوب است. درب همان‌طور که در سایت سوار می‌شود اینجا هم سوار شده: با محل اتصالی که بالا تنظیم می‌کنید، بدون کوچک و بزرگ شدن. با «برش نیم‌رخ» ببینید گلو درست داخل درب نشسته باشد.
        </p>
      </div>
    </div>
  );
}
