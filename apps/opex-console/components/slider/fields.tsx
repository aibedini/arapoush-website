"use client";

import { createContext, useContext, useState } from "react";
import type { Device, ImageValue } from "@arapoush/schema";
import { ArrowCounterClockwise, ImageSquare, Trash, VideoCamera } from "@phosphor-icons/react";
import { previewSrc } from "@/lib/api";
import { assetUrl, MediaLibrary, type Asset } from "../MediaLibrary";
import { Dialog } from "../ui";
import { DEVICE_LABEL } from "./model";

/** The row's label, so each control inside it has the same spoken name as the visible label. */
const LabelCtx = createContext<string | undefined>(undefined);

/** A field row: label, the device it writes to, and a reset when this device overrides the value. */
export function Row({ label, device, over, onReset, children, wide }: { label: string; device?: Device; over?: boolean; onReset?: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`ss-row${wide ? " wide" : ""}`} data-over={over || undefined}>
      <div className="ss-label">
        <span>{label}</span>
        {over && device && (
          <button type="button" className="ss-reset" onClick={onReset} title={`برگرداندن به مقدار ${device === "mobile" ? "تبلت/دسکتاپ" : "دسکتاپ"}`}>
            <span className="ss-dot" aria-hidden="true" />
            <span className="sr-only">برای {DEVICE_LABEL[device]} تغییر کرده؛ برگرداندن</span>
            <ArrowCounterClockwise size={13} aria-hidden />
          </button>
        )}
      </div>
      <div className="ss-ctl">
        <LabelCtx.Provider value={label}>{children}</LabelCtx.Provider>
      </div>
    </div>
  );
}

export function Num({ value, onChange, min, max, step = 1, unit, slider = true, disabled }: { value: unknown; onChange: (v: number | undefined) => void; min: number; max: number; step?: number; unit?: string; slider?: boolean; disabled?: boolean }) {
  const v = typeof value === "number" ? value : undefined;
  const name = useContext(LabelCtx);
  return (
    <div className="ss-num">
      {slider && <input type="range" min={min} max={max} step={step} value={v ?? min} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-hidden="true" tabIndex={-1} />}
      <input type="number" aria-label={name} dir="ltr" min={min} max={max} step={step} value={v ?? ""} placeholder="—" disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? undefined : Math.min(max, Math.max(min, Number(e.target.value))))} />
      {unit && <span className="ss-unit">{unit}</span>}
    </div>
  );
}

/** Colour with alpha: a swatch picker plus the text value (#rrggbb or #rrggbbaa, rgba()). */
export function Colour({ value, onChange, disabled }: { value: unknown; onChange: (v: string | undefined) => void; disabled?: boolean }) {
  const v = typeof value === "string" ? value : "";
  const hex = /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7) : "#000000";
  const alpha = /^#[0-9a-f]{8}$/i.test(v) ? parseInt(v.slice(7, 9), 16) / 255 : 1;
  const name = useContext(LabelCtx) ?? "رنگ";
  const withAlpha = (h: string, a: number) => (a >= 1 ? h : `${h}${Math.round(a * 255).toString(16).padStart(2, "0")}`);
  return (
    <div className="ss-colour">
      <input type="color" value={hex} disabled={disabled} onChange={(e) => onChange(withAlpha(e.target.value, alpha))} aria-label={`${name}: انتخاب`} />
      <input type="text" aria-label={name} dir="ltr" value={v} placeholder="پیش‌فرض" disabled={disabled} onChange={(e) => onChange(e.target.value.trim() || undefined)} />
      <input type="range" min={0} max={1} step={0.05} value={alpha} disabled={disabled || !v} onChange={(e) => onChange(withAlpha(hex, Number(e.target.value)))} aria-label={`${name}: شفافیت`} title="شفافیت" />
    </div>
  );
}

export function Toggle({ value, onChange, label, disabled }: { value: unknown; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, disabled }: { value: unknown; options: readonly (readonly [T, React.ReactNode])[]; onChange: (v: T) => void; disabled?: boolean }) {
  const name = useContext(LabelCtx);
  return (
    <span className="seg ss-seg" role="group" aria-label={name}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} disabled={disabled} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </span>
  );
}

export function Pick<T extends string>({ value, options, onChange, disabled, empty }: { value: unknown; options: readonly (readonly [T, string])[]; onChange: (v: T | undefined) => void; disabled?: boolean; empty?: string }) {
  const name = useContext(LabelCtx);
  return (
    <select aria-label={name} value={typeof value === "string" ? value : ""} disabled={disabled} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}

const LOCALES = [
  ["fa", "فارسی"],
  ["en", "English"],
  ["tr", "Türkçe"],
] as const;

/** One text in three languages, one tab each. */
export function Texts({ value, onChange, multiline, disabled }: { value: unknown; onChange: (v: Record<string, string> | undefined) => void; multiline?: boolean; disabled?: boolean }) {
  const [loc, setLoc] = useState<"fa" | "en" | "tr">("fa");
  const v = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  const set = (s: string) => {
    const next = { ...v, [loc]: s };
    if (!s) delete next[loc];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const Input = multiline ? "textarea" : "input";
  const name = useContext(LabelCtx);
  return (
    <div className="ss-texts">
      <Seg value={loc} options={LOCALES.map(([k, l]) => [k, <span key={k}>{l}{v[k] ? "" : " ·"}</span>] as const)} onChange={setLoc} />
      <Input aria-label={name ? `${name} (${LOCALES.find(([k]) => k === loc)![1]})` : undefined} dir={loc === "fa" ? "rtl" : "ltr"} rows={multiline ? 3 : undefined} value={v[loc] ?? ""} disabled={disabled} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => set(e.target.value)} placeholder={loc === "fa" ? "" : v.fa ?? ""} />
    </div>
  );
}

/** Image or video from the media library (upload with or without compression right there). */
export function MediaField({ value, onChange, kind = "image", disabled }: { value: unknown; onChange: (v: ImageValue | string | undefined) => void; kind?: "image" | "video"; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const src = kind === "image" ? (value as ImageValue | undefined)?.src : (value as string | undefined);
  const pick = (a: Asset) => {
    const url = assetUrl(a);
    onChange(kind === "image" ? { src: url, ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}) } : url);
    setOpen(false);
  };
  return (
    <div className="ss-media">
      {src ? kind === "image" ? <img src={previewSrc(src)} alt="" /> : <video src={previewSrc(src)} muted playsInline preload="metadata" /> : <div className="ss-media-empty">{kind === "image" ? <ImageSquare size={20} aria-hidden /> : <VideoCamera size={20} aria-hidden />}</div>}
      <div className="row">
        <button type="button" className="btn sm" disabled={disabled} onClick={() => setOpen(true)}>
          {src ? "تغییر" : "انتخاب یا بارگذاری"}
        </button>
        {src && (
          <button type="button" className="btn sm ghost" disabled={disabled} onClick={() => onChange(undefined)} aria-label="حذف">
            <Trash size={14} aria-hidden />
          </button>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={kind === "image" ? "انتخاب تصویر" : "انتخاب ویدیو"} wide>
        <MediaLibrary onPick={pick} accept={kind === "image" ? "image/*,.svg" : ".mp4,.webm,video/mp4,video/webm"} kinds={kind === "image" ? ["image/"] : ["video/"]} />
      </Dialog>
    </div>
  );
}
