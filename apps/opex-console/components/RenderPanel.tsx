"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { ago, num } from "@/lib/fa";
import { ErrorNote } from "./ui";

type Job = { id: string; status: string; attempts: number; created_at: string; finished_at: string | null; error: string | null; revision: number | null; sizes: number };
const STATUS: Record<string, [string, string]> = {
  pending: ["در صف", "warn"],
  running: ["در حال رندر", "accent"],
  done: ["انجام شد", "ok"],
  failed: ["ناموفق", "bad"],
  superseded: ["جایگزین شد", ""],
};

/**
 * 3D renders of the effervescent page (P10). Changing a size or cap queues a render automatically;
 * the renderer writes the new images and dimension marks into a fresh draft revision to review.
 */
export function RenderPanel({ canRender, onDone }: { canRender: boolean; onDone: () => void }) {
  const jobs = useApi<Job[]>("/v1/manage/render/jobs");
  const act = useAction();
  const active = jobs.data?.some((j) => j.status === "pending" || j.status === "running");
  // While a job is queued or running, check every 10 s; reload the draft when one finishes.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(jobs.reload, 10_000);
    return () => clearInterval(t);
  }, [active, jobs.reload]);
  // Reload the editor once per job that finishes while this page is open (not for old jobs).
  const last = jobs.data?.[0];
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!last) return;
    if (seen.current === null) seen.current = last.status === "done" ? last.id : "";
    else if (last.status === "done" && seen.current !== last.id) {
      seen.current = last.id;
      doneRef.current();
    }
  }, [last]);

  return (
    <section className="card" aria-labelledby="render-h">
      <div className="card-head">
        <div>
          <h2 id="render-h">رندرهای سه‌بعدی</h2>
          <p className="small muted">با تغییر اندازه‌ها یا درپوش‌ها، تصویر اندازه‌ها، درپوش‌ها و پوسترها خودکار دوباره رندر و در یک نسخهٔ پیش‌نویس تازه قرار می‌گیرد.</p>
        </div>
        {canRender && (
          <button type="button" className="btn sm" disabled={act.busy || active} onClick={() => act.run(async () => (await api("/v1/manage/render", { body: {} }), jobs.reload()), "رندر در صف قرار گرفت.")}>
            رندر دوباره
          </button>
        )}
      </div>
      <div className="card-body stack">
        <ErrorNote error={act.error ?? jobs.error} />
        {act.done && <div className="note ok" role="status">{act.done}</div>}
        {!jobs.data?.length ? (
          <p className="small muted">هنوز رندری انجام نشده است.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-live="polite">
            {jobs.data.slice(0, 5).map((j) => (
              <li key={j.id} className="row small" style={{ justifyContent: "space-between", paddingBlock: 4 }}>
                <span className="row">
                  <span className={`badge ${STATUS[j.status]?.[1] ?? ""}`}>{STATUS[j.status]?.[0] ?? j.status}</span>
                  <span>{num(j.sizes)} اندازه · از نسخهٔ {num(j.revision)}</span>
                  {j.error && <span className="muted" title={j.error}>({num(j.attempts)} تلاش)</span>}
                </span>
                <span className="muted">{ago(j.finished_at ?? j.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
