"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, bytes } from "@/lib/fa";
import { ErrorNote, Loading } from "./ui";

export type Asset = { id: string; mime: string; bytes: number; width: number | null; height: number | null; original_name: string; status: string; scan: string | null; public: boolean; created_at: string; uploaded_by: string | null };

const EXT: Record<string, string> = { "image/webp": "webp", "image/svg+xml": "svg", "application/pdf": "pdf" };
export const assetUrl = (a: Asset) => `/media/${a.id}.${EXT[a.mime] ?? "webp"}`;
export const assetPreview = (a: Asset) => `/v1/manage/media/${a.id}.${EXT[a.mime] ?? "webp"}/raw`;

/** Browse, search and upload media. With `onPick`, tiles are buttons that choose an asset. */
export function MediaLibrary({ onPick, accept = "image/*,.svg,.pdf" }: { onPick?: (a: Asset) => void; accept?: string }) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useApi<Asset[]>(`/v1/manage/media${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  const up = useAction();
  const file = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const form = new FormData();
      form.append("file", f, f.name);
      const a = await up.run(() => api<Asset>("/v1/manage/media", { form }), `«${f.name}» بارگذاری شد.`);
      if (!a) break;
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
            <input ref={file} id="media-file" type="file" accept={accept} multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
            <button type="button" className="btn primary" disabled={up.busy} onClick={() => file.current?.click()}>
              {up.busy ? "در حال بارگذاری…" : "بارگذاری فایل"}
            </button>
          </>
        )}
      </div>
      <p className="small muted">تصویرها به WebP تبدیل و فرادادهٔ آن‌ها (EXIF، موقعیت) پاک می‌شود. SVG و PDF دارای اسکریپت پذیرفته نمی‌شوند. فایل‌ها تا انتشار محتوایی که از آن‌ها استفاده می‌کند خصوصی می‌مانند.</p>
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
          {data?.map((a) => {
            const inner = (
              <>
                {a.mime.startsWith("image/") ? <img src={assetPreview(a)} alt="" loading="lazy" width={a.width ?? undefined} height={a.height ?? undefined} /> : <div className="empty">PDF</div>}
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
