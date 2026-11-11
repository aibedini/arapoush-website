"use client";

import { useRef } from "react";
import { previewSrc } from "@/lib/api";

type Part = { id: string; y: number; x: number };
type Variant = { id: string; name?: Record<string, string>; photo?: { src: string; width?: number; height?: number }; parts?: Part[] };
type Data = { data?: { caps?: { variants?: Variant[] } } } & Record<string, unknown>;

const LABEL: Record<string, string> = { cap: "درپوش", structure: "ساختار", chamber: "محفظه", mouth: "دهانه" };
const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/**
 * Where each part sits on the cap photo (plan §6.4): y = centre from the top, x = inset from the side
 * the callouts are on, both as fractions of the photo. The overlay draws markers exactly as the site
 * does (top: y·100 %, inset-inline-end: x·100 %), shown here in left-to-right page order.
 */
export function CapPositions({ data, orig, onChange, canEdit }: { data: Data; orig: Data; onChange: (d: Data) => void; canEdit: boolean }) {
  const variants = data.data?.caps?.variants ?? [];
  const origVariants = orig.data?.caps?.variants ?? [];
  const boxes = useRef<Record<string, HTMLDivElement | null>>({});
  const drag = useRef<{ v: number; p: number } | null>(null);

  const setPart = (vi: number, pi: number, patch: Partial<Part>) => {
    const next = structuredClone(data) as Data;
    const part = next.data!.caps!.variants![vi]!.parts![pi]!;
    Object.assign(part, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, round(v as number)])));
    onChange(next);
  };
  const fromPointer = (vi: number, e: React.PointerEvent) => {
    const box = boxes.current[variants[vi]!.id]?.getBoundingClientRect();
    if (!box || !drag.current) return;
    setPart(vi, drag.current.p, { y: (e.clientY - box.top) / box.height, x: (box.right - e.clientX) / box.width });
  };

  return (
    <section className="card" aria-labelledby="caps-h">
      <div className="card-head">
        <div>
          <h2 id="caps-h">جای قطعه‌ها روی عکس درپوش</h2>
          <p className="small muted">نشانگرها را بکشید یا با کلیدهای جهت جابه‌جا کنید (Shift برای گام بزرگ‌تر). این مقدارها قفل‌اند: فقط مدیر ارشد با تأیید دوباره ذخیره می‌کند.</p>
        </div>
      </div>
      <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {variants.map((v, vi) => {
          const o = origVariants.find((x) => x.id === v.id);
          const photoChanged = !!o && o.photo?.src !== v.photo?.src;
          const partsUnchanged = JSON.stringify(o?.parts) === JSON.stringify(v.parts);
          const ratio = v.photo?.width && v.photo?.height ? `${v.photo.width} / ${v.photo.height}` : "4 / 5";
          return (
            <div key={v.id} className="stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{v.name?.fa ?? v.id}</b>
                <code className="small muted">{v.id}</code>
              </div>
              {photoChanged && partsUnchanged && <div className="note warn small">عکس عوض شده؛ جای قطعه‌ها باید دوباره اندازه‌گیری شود.</div>}
              <div
                ref={(el) => {
                  boxes.current[v.id] = el;
                }}
                dir="ltr"
                style={{ position: "relative", aspectRatio: ratio, maxInlineSize: 340, background: "var(--surface-2)", borderRadius: 8, overflow: "hidden", touchAction: "none", userSelect: "none" }}
                onPointerMove={(e) => drag.current?.v === vi && fromPointer(vi, e)}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              >
                {v.photo?.src && <img src={previewSrc(v.photo.src)} alt="" draggable={false} style={{ position: "absolute", inset: 0, inlineSize: "100%", blockSize: "100%", objectFit: "cover" }} />}
                {(v.parts ?? []).map((p, pi) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!canEdit}
                    aria-label={`${LABEL[p.id] ?? p.id}: بالا ${Math.round(p.y * 100)}٪، از کنار ${Math.round(p.x * 100)}٪`}
                    onPointerDown={(e) => {
                      if (!canEdit) return;
                      (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                      drag.current = { v: vi, p: pi };
                    }}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.02 : 0.005;
                      const d = { ArrowUp: { y: p.y - step }, ArrowDown: { y: p.y + step }, ArrowLeft: { x: p.x + step }, ArrowRight: { x: p.x - step } }[e.key];
                      if (!d) return;
                      e.preventDefault();
                      setPart(vi, pi, d);
                    }}
                    style={{ position: "absolute", top: `${p.y * 100}%`, right: `${p.x * 100}%`, transform: "translate(50%, -50%)", inlineSize: 28, blockSize: 28, borderRadius: "50%", border: "2px solid #fff", background: "rgba(13, 58, 92, 0.85)", color: "#fff", font: "600 12px/1 var(--font-latin)", cursor: canEdit ? "grab" : "default", boxShadow: "0 2px 8px rgba(0,0,0,.35)" }}
                  >
                    {pi + 1}
                  </button>
                ))}
              </div>
              <table className="small">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>قطعه</th>
                    <th>از بالا (y)</th>
                    <th>از کنار (x)</th>
                  </tr>
                </thead>
                <tbody>
                  {(v.parts ?? []).map((p, pi) => {
                    const op = o?.parts?.find((x) => x.id === p.id);
                    const moved = op && (op.x !== p.x || op.y !== p.y);
                    return (
                      <tr key={p.id} className={moved ? "changed" : undefined}>
                        <td>{pi + 1}</td>
                        <td>{LABEL[p.id] ?? p.id}</td>
                        {(["y", "x"] as const).map((k) => (
                          <td key={k}>
                            <input type="number" dir="ltr" step={0.005} min={0} max={1} disabled={!canEdit} value={p[k]} aria-label={`${LABEL[p.id] ?? p.id} ${k}`} onChange={(e) => setPart(vi, pi, { [k]: Number(e.target.value) })} style={{ maxInlineSize: 96, minBlockSize: 30 }} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
