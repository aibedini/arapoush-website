"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Dialog, ErrorNote, Loading } from "./ui";

const WIDTHS = [
  { w: 390, label: "موبایل" },
  { w: 768, label: "تبلت" },
  { w: 1440, label: "دسکتاپ" },
] as const;

/** Scales a full-size page into the space it has, like a device mock-up. */
function Frame({ src, width }: { src: string; width: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const h = 900;
  return (
    <div ref={box} dir="ltr" style={{ position: "relative", blockSize: h * scale, overflow: "hidden", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}>
      <iframe title={`پیش‌نمایش ${width} پیکسل`} src={src} style={{ position: "absolute", top: 0, left: 0, display: "block", width, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }} sandbox="allow-scripts allow-same-origin allow-forms" />
    </div>
  );
}

/**
 * The website with drafts (or one change request) applied, at phone, tablet and desktop widths.
 * The link is signed by OPEX for 30 minutes; the preview is never indexed.
 */
export function PreviewFrames({ open, onClose, type, cr }: { open: boolean; onClose: () => void; type: string; cr?: string }) {
  const [locale, setLocale] = useState<"fa" | "en" | "tr">("fa");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(null);
    api<{ url: string }>("/v1/manage/preview", { body: { type, locale, ...(cr ? { cr } : {}) } })
      .then((r) => setUrl(r.url))
      .catch(setError);
  }, [open, type, cr, locale]);
  return (
    <Dialog open={open} onClose={onClose} title={cr ? "پیش‌نمایش این درخواست روی سایت" : "پیش‌نمایش پیش‌نویس روی سایت"} wide>
      <div className="row">
        {(["fa", "en", "tr"] as const).map((l) => (
          <button key={l} type="button" className={`btn sm${l === locale ? " primary" : ""}`} aria-pressed={l === locale} onClick={() => setLocale(l)}>
            {l.toUpperCase()}
          </button>
        ))}
        {url && (
          <a className="btn sm ghost" href={url} target="_blank" rel="noopener noreferrer">
            باز کردن در زبانهٔ تازه
          </a>
        )}
      </div>
      <ErrorNote error={error} />
      {!url && !error ? (
        <Loading rows={3} />
      ) : url ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 3fr", gap: 12, alignItems: "start" }}>
          {WIDTHS.map((d) => (
            <figure key={d.w} style={{ margin: 0, display: "grid", gap: 4 }}>
              <figcaption className="small muted">
                {d.label} · {d.w}px
              </figcaption>
              <Frame src={url} width={d.w} />
            </figure>
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}
