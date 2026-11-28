"use client";

import { useEffect, useRef, useState } from "react";
import { LABEL_ACCEPT, LabelReadError, readLabel, type LabelArt, type LabelError } from "@/lib/configurator/label";
import ChipGroup from "./ChipGroup";
import styles from "./Configurator.module.css";

export type LabelOptions = { mode: "wrap" | "front"; scale: number; y: number };
export const LABEL_DEFAULTS: LabelOptions = { mode: "front", scale: 0.4, y: 0.5 };

export type LabelText = {
  label: string;
  labelUpload: string;
  labelReplace: string;
  labelRemove: string;
  labelHint: string;
  labelReading: string;
  labelWrap: string;
  labelFront: string;
  labelSize: string;
  labelPosition: string;
  labelPrivacy: string;
  labelErrType: string;
  labelErrSize: string;
  labelErrAi: string;
  labelErrRead: string;
};

const ERR: Record<LabelError, keyof LabelText> = { type: "labelErrType", size: "labelErrSize", ai: "labelErrAi", read: "labelErrRead" };

/**
 * The visitor's own label on the 3D tube: JPG, PNG, WebP, SVG, PDF or Illustrator (PDF-compatible).
 * The file is read in the browser and never leaves it; the tube shows it at its real size.
 */
export default function LabelField({ id, t, art, options, onArt, onOptions }: { id: string; t: LabelText; art: LabelArt | null; options: LabelOptions; onArt: (a: LabelArt | null) => void; onOptions: (o: LabelOptions) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const latest = useRef(art);
  latest.current = art;
  // Free the last object URL when the configurator goes away.
  useEffect(() => () => void (latest.current && URL.revokeObjectURL(latest.current.src)), []);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const next = await readLabel(file);
      if (art) URL.revokeObjectURL(art.src);
      onArt(next);
    } catch (e) {
      setError(t[ERR[e instanceof LabelReadError ? e.code : "read"]]);
    } finally {
      setBusy(false);
    }
  };
  const remove = () => {
    if (art) URL.revokeObjectURL(art.src);
    onArt(null);
    setError("");
  };

  return (
    <div className={styles.label}>
      <div
        className={styles.labelDrop}
        data-drag={drag || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void read(e.dataTransfer.files[0]);
        }}
      >
        {art && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a site image
          <img className={styles.labelThumb} src={art.src} alt="" data-no-mirror />
        )}
        <div className={styles.labelMeta}>
          {art ? (
            <span className={styles.labelName} dir="auto">
              {art.name}
            </span>
          ) : (
            <span className={styles.labelHint}>{t.labelHint}</span>
          )}
          <span className={styles.labelButtons}>
            <button type="button" className={styles.labelBtn} disabled={busy} aria-busy={busy || undefined} onClick={() => input.current?.click()}>
              {busy ? t.labelReading : art ? t.labelReplace : t.labelUpload}
            </button>
            {art && (
              <button type="button" className={styles.labelBtn} onClick={remove}>
                {t.labelRemove}
              </button>
            )}
          </span>
        </div>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept={LABEL_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t.labelUpload}
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className={styles.labelError} role="alert">
          {error}
        </p>
      )}
      {art && (
        <>
          <ChipGroup
            plain
            labelledBy={id}
            value={options.mode}
            onChange={(v) => onOptions({ ...options, mode: v as LabelOptions["mode"] })}
            items={[
              { key: "front", content: t.labelFront },
              { key: "wrap", content: t.labelWrap },
            ]}
          />
          {options.mode === "front" && (
            <div className={styles.labelSliders}>
              <label htmlFor={`${id}-scale`}>
                <span>{t.labelSize}</span>
                <input id={`${id}-scale`} type="range" min={0.1} max={1} step={0.01} value={options.scale} onChange={(e) => onOptions({ ...options, scale: Number(e.target.value) })} />
              </label>
              <label htmlFor={`${id}-y`}>
                <span>{t.labelPosition}</span>
                <input id={`${id}-y`} type="range" min={0} max={1} step={0.01} value={options.y} onChange={(e) => onOptions({ ...options, y: Number(e.target.value) })} />
              </label>
            </div>
          )}
        </>
      )}
      <p className={styles.labelHint}>{t.labelPrivacy}</p>
    </div>
  );
}
