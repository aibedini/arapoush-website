"use client";

import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { ago, num, when } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type Delivery = { id: string; target: string; event: string; status: string; attempt: number; last_code: number | null; last_error: string | null; next_attempt_at: string; created_at: string };
const STATUS: Record<string, [string, string]> = { pending: ["در صف", "warn"], delivered: ["تحویل شد", "ok"], failed: ["ناموفق", "bad"], dead: ["متوقف (۲۴ تلاش)", "bad"] };

/** Outbound events to the website and AraCMS: delivery status, retries and the dead-letter list. */
export default function Webhooks() {
  const list = useApi<Delivery[]>("/v1/manage/webhooks");
  const act = useAction();
  const retry = (d: Delivery) => act.run(async () => (await api(`/v1/manage/webhooks/${d.id}/retry`, { body: {} }), list.reload()), "دوباره در صف ارسال قرار گرفت.");
  return (
    <>
      <PageHead title="وب‌هوک‌ها" sub="رویدادهایی که OPEX برای سایت (به‌روزرسانی صفحه‌ها) و آراسی‌ام‌اس (وضعیت درخواست‌ها) می‌فرستد.">
        <button type="button" className="btn" onClick={list.reload}>تازه‌سازی</button>
      </PageHead>
      <ErrorNote error={act.error ?? list.error} />
      {act.done && <div className="note ok" role="status" style={{ marginBlockEnd: 12 }}>{act.done}</div>}
      <section className="card" aria-label="ارسال‌ها">
        {!list.data ? (
          <div className="card-body"><Loading /></div>
        ) : !list.data.length ? (
          <div className="empty">هنوز رویدادی ارسال نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>رویداد</th><th>مقصد</th><th>وضعیت</th><th>تلاش</th><th>آخرین پاسخ</th><th>زمان</th><th><span className="sr-only">کار</span></th></tr>
              </thead>
              <tbody>
                {list.data.map((d) => (
                  <tr key={d.id}>
                    <td><code>{d.event}</code></td>
                    <td>{d.target === "site" ? "سایت" : <span>آراسی‌ام‌اس <code className="small muted">{d.target.slice(8)}</code></span>}</td>
                    <td><span className={`badge ${STATUS[d.status]?.[1] ?? ""}`}>{STATUS[d.status]?.[0] ?? d.status}</span></td>
                    <td className="num">{num(d.attempt)}</td>
                    <td className="small">{d.last_code ? <code>{d.last_code}</code> : d.last_error ? <span className="muted">{d.last_error.slice(0, 80)}</span> : "—"}{d.status === "pending" && d.attempt > 0 && <div className="muted">تلاش بعدی: {when(d.next_attempt_at)}</div>}</td>
                    <td className="small muted">{ago(d.created_at)}</td>
                    <td>{d.status !== "delivered" && <button type="button" className="btn sm" onClick={() => retry(d)} disabled={act.busy}>ارسال دوباره</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
