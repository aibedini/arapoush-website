"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, bytes } from "@/lib/fa";
import { ErrorNote, Loading } from "./ui";

export type Asset = { id: string; mime: string; bytes: number; width: number | null; height: number | null; original_name: string; status: string; scan: string | null; public: boolean; created_at: string; uploaded_by: string | null };

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "model/gltf-binary": "glb",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
};
export const assetUrl = (a: Asset) => `/media/${a.id}.${EXT[a.mime] ?? "webp"}`;
export const assetPreview = (a: Asset) => `/v1/manage/media/${a.id}.${EXT[a.mime] ?? "webp"}/raw`;

/** How raster uploads are compressed (API `compress`). Remembered per browser. */
export const COMPRESS = [
  ["original", "بدون فشرده‌سازی (کیفیت اصل)"],
  ["standard", "استاندارد (WebP، کیفیت ۸۸)"],
  ["balanced", "متعادل (WebP، تا ۲۵۶۰ پیکسل)"],
  ["max", "حداکثر (WebP، تا ۱۹۲۰ پیکسل)"],
] as const;
type Compress = (typeof COMPRESS)[number][0];
const COMPRESS_KEY = "opex:compress";

/** Browse, search and upload media. With `onPick`, tiles are buttons that choose an asset. `kinds` filters the grid by mime prefix. */
export function MediaLibrary({ onPick, accept = "image/*,.svg,.pdf,.mp4,.webm,.woff2,.woff,.ttf,.otf", kinds }: { onPick?: (a: Asset) => void; accept?: string; kinds?: string[] }) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useApi<Asset[]>(`/v1/manage/media${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  const up = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [compress, setCompressState] = useState<Compress>(() => {
    try {
      const v = localStorage.getItem(COMPRESS_KEY);
      if (COMPRESS.some(([k]) => k === v)) return v as Compress;
    } catch {}
    return "original";
  });
  const setCompress = (v: Compress) => {
    setCompressState(v);
    try {
      localStorage.setItem(COMPRESS_KEY, v);
    } catch {}
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const form = new FormData();
      form.append("file", f, f.name);
      const a = await up.run(() => api<Asset & { url: string }>(`/v1/manage/media?compress=${compress}`, { form }));
      if (!a) break;
      up.setDone(`«${f.name}» بارگذاری شد${a.mime.startsWith("image/") && a.mime !== "image/svg+xml" ? ` (${bytes(f.size)} ← ${bytes(a.bytes)})` : ""}.`);
      if (onPick && files.length === 1) onPick({ ...a, original_name: f.name, public: false, created_at: new Date().toISOString(), uploaded_by: null, scan: a.scan ?? null });
    }
    if (file.current) file.current.value = "";
    reload();
  };

  return (
    <div className="stack">
      <div className="row">
        <form
          className="row"
          style={{ flex: "1 1 260px" }}
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="media-q">
            جست‌وجو در نام فایل
          </label>
          <input id="media-q" type="search" placeholder="جست‌وجو در نام فایل" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <button className="btn">جست‌وجو</button>
        </form>
        {canWrite(me) && (
          <>
            <label className="sr-only" htmlFor="media-compress">
              فشرده‌سازی تصویر هنگام بارگذاری
            </label>
            <select id="media-compress" value={compress} onChange={(e) => setCompress(e.target.value as Compress)} style={{ inlineSize: "auto" }} title="فشرده‌سازی تصویر هنگام بارگذاری">
              {COMPRESS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input ref={file} id="media-file" type="file" accept={accept} multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
            <button type="button" className="btn primary" disabled={up.busy} onClick={() => file.current?.click()}>
              {up.busy ? "در حال بارگذاری…" : "بارگذاری فایل"}
            </button>
          </>
        )}
      </div>
      <p className="small muted">
        فرادادهٔ تصویرها (EXIF، موقعیت) همیشه پاک می‌شود. «بدون فشرده‌سازی» فرمت و کیفیت اصل را نگه می‌دارد (شفافیت PNG هم می‌ماند)؛ سایت خودش برای هر دستگاه اندازهٔ مناسب را می‌سازد. ویدیو (MP4، WebM تا ۲۵ مگابایت) و فونت (WOFF2، WOFF، TTF، OTF) همان‌طور که هستند ذخیره می‌شوند. SVG و PDF دارای اسکریپت پذیرفته نمی‌شوند. فایل‌ها تا انتشار محتوایی که از آن‌ها استفاده می‌کند خصوصی می‌مانند.
      </p>
      <ErrorNote error={up.error ?? error} />
      {up.done && (
        <div className="note ok" role="status">
          {up.done}
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : data && data.length === 0 ? (
        <div className="empty">هنوز فایلی بارگذاری نشده است.</div>
      ) : (
        <div className="media-grid">
          {data?.filter((a) => !kinds || kinds.some((k) => a.mime.startsWith(k))).map((a) => {
            const inner = (
              <>
                {a.mime.startsWith("image/") ? (
                  <img src={assetPreview(a)} alt="" loading="lazy" width={a.width ?? undefined} height={a.height ?? undefined} />
                ) : a.mime.startsWith("video/") ? (
                  <video src={assetPreview(a)} muted playsInline preload="metadata" aria-hidden="true" />
                ) : (
                  <div className="empty">{a.mime.startsWith("font/") ? `Aa · ${EXT[a.mime]?.toUpperCase()}` : (EXT[a.mime] ?? "file").toUpperCase()}</div>
                )}
                <div className="meta">
                  <span title={a.original_name}>{a.original_name}</span>
                  <span className="muted">
                    {a.width ? `${a.width}×${a.height} · ` : ""}
                    {bytes(a.bytes)} · {ago(a.created_at)}
                  </span>
                  <span>{a.public ? <span className="badge ok">منتشرشده</span> : <span className="badge">خصوصی</span>}</span>
                </div>
              </>
            );
            return onPick ? (
              <button key={a.id} type="button" className="media-tile" onClick={() => onPick(a)} aria-label={`انتخاب ${a.original_name}`}>
                {inner}
              </button>
            ) : (
              <div key={a.id} className="media-tile">
                {inner}
                <div className="meta">
                  <code className="small" style={{ wordBreak: "break-all" }}>
                    {assetUrl(a)}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
