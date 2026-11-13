"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type Sev = "critical" | "high" | "medium" | "low" | "info";
type Issue = { rule: string; severity: Sev; category: string; message: string; detail?: string };
type Summary = { id: string; trigger: string; status: "running" | "done" | "failed"; base_url: string; score: number | null; counts: Record<Sev, number> | null; error: string | null; created_at: string; finished_at: string | null };
type Report = Summary & { categories: Record<string, number>; site: Issue[]; pages: { url: string; status: number; ms: number; bytes: number; score: number; title: string | null; issues: Issue[] }[] };

const SEV: Record<Sev, [string, string]> = { critical: ["بحرانی", "bad"], high: ["زیاد", "bad"], medium: ["متوسط", "warn"], low: ["کم", ""], info: ["اطلاع", ""] };
const CAT: Record<string, string> = { technical: "فنی و ایندکس", onpage: "محتوای صفحه", i18n: "چندزبانه (hreflang)", schema: "داده‌های ساختاریافته", images: "تصاویر", links: "لینک‌ها", geo: "GEO / AIO (موتورهای هوش مصنوعی)", sxo: "SXO (تجربهٔ جستجو)", performance: "سرعت", security: "امنیت" };
const TRIGGER: Record<string, string> = { manual: "دستی", schedule: "زمان‌بندی", publish: "بعد از انتشار" };

/** S5: the automatic SEO / GEO / AIO / SXO checks of the live site. */
export default function SeoPage() {
  const me = useMe();
  const list = useApi<Summary[]>("/v1/manage/seo/reports");
  const act = useAction();
  const [id, setId] = useState<string | null>(null);
  const current = id ?? list.data?.find((r) => r.status === "done")?.id ?? null;
  const report = useApi<Report>(current ? `/v1/manage/seo/reports/${current}` : null);
  const running = list.data?.some((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(list.reload, 4000);
    return () => clearInterval(t);
  }, [running, list.reload]);
  const run = () =>
    act.run(async () => {
      const r = await api<{ id: string }>("/v1/manage/seo/run", { method: "POST" });
      setId(r.id);
      list.reload();
    }, "بررسی شروع شد؛ چند دقیقه طول می‌کشد.");

  return (
    <>
      <PageHead title="سئو و هوش مصنوعی" sub="بررسی خودکار سایت زنده: فنی، محتوای صفحه، hreflang، داده‌های ساختاریافته، تصاویر، لینک‌ها، آمادگی برای پاسخ‌های هوش مصنوعی (GEO/AIO)، تجربهٔ جستجو (SXO)، سرعت و امنیت.">
        {can(me, "seo.run") && (
          <button type="button" className="btn primary" disabled={act.busy || running} onClick={run}>
            {running ? "در حال بررسی…" : "بررسی الان"}
          </button>
        )}
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error ?? report.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        <section className="card" aria-label="اجراها">
          {!list.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : !list.data.length ? (
            <div className="card-body muted">هنوز بررسی‌ای انجام نشده است.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>زمان</th>
                    <th>نوع</th>
                    <th>امتیاز</th>
                    <th>مشکل‌ها</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.slice(0, 12).map((r) => (
                    <tr key={r.id} aria-current={r.id === current ? "true" : undefined}>
                      <td className="small">{ago(r.created_at)}</td>
                      <td className="small">{TRIGGER[r.trigger] ?? r.trigger}</td>
                      <td>{r.status === "done" ? <Score n={r.score ?? 0} /> : r.status === "running" ? <span className="badge">در حال اجرا</span> : <span className="badge bad" title={r.error ?? ""}>ناموفق</span>}</td>
                      <td className="small">{r.counts ? `${r.counts.critical} بحرانی · ${r.counts.high} زیاد · ${r.counts.medium} متوسط` : ""}</td>
                      <td>
                        {r.status === "done" && (
                          <button type="button" className="btn sm" onClick={() => setId(r.id)}>
                            دیدن
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {report.data && (
          <>
            <section className="card" aria-label="امتیاز بخش‌ها">
              <div className="card-head">
                <h2>
                  امتیاز کل <Score n={report.data.score ?? 0} />
                </h2>
                <span className="small muted" dir="ltr">
                  {report.data.base_url}
                </span>
              </div>
              <div className="card-body row" style={{ flexWrap: "wrap", gap: 12 }}>
                {Object.entries(report.data.categories).map(([k, v]) => (
                  <div key={k} className="card" style={{ padding: 12, minInlineSize: 150 }}>
                    <div className="small muted">{CAT[k] ?? k}</div>
                    <Score n={v} />
                  </div>
                ))}
              </div>
            </section>
            {report.data.site.length > 0 && (
              <section className="card" aria-label="مشکل‌های کل سایت">
                <div className="card-head">
                  <h2>کل سایت (robots، نقشهٔ سایت، llms.txt، صفحهٔ ۴۰۴)</h2>
                </div>
                <Issues list={report.data.site} />
              </section>
            )}
            <section className="card" aria-label="صفحه‌ها">
              <div className="card-head">
                <h2>صفحه‌ها ({report.data.pages.length})</h2>
              </div>
              <div className="stack" style={{ padding: 12 }}>
                {[...report.data.pages]
                  .sort((x, y) => x.score - y.score)
                  .map((p) => (
                    <details key={p.url} className="card" style={{ padding: 10 }}>
                      <summary className="row" style={{ cursor: "pointer", gap: 10, minBlockSize: 28 }}>
                        <Score n={p.score} />
                        <code dir="ltr" className="small">
                          {p.url.replace(/^https?:\/\/[^/]+/, "")}
                        </code>
                        <span className="small muted">
                          {p.issues.length} مورد · {p.ms} ms
                        </span>
                      </summary>
                      {p.title && <p className="small muted">{p.title}</p>}
                      <Issues list={p.issues} />
                    </details>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function Score({ n }: { n: number }) {
  return <span className={`badge ${n >= 90 ? "ok" : n >= 70 ? "warn" : "bad"}`}>{n}</span>;
}

function Issues({ list }: { list: Issue[] }) {
  if (!list.length) return <p className="small muted">بدون مشکل.</p>;
  const order: Sev[] = ["critical", "high", "medium", "low", "info"];
  return (
    <div className="table-wrap">
      <table>
        <tbody>
          {[...list]
            .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
            .map((i, k) => (
              <tr key={i.rule + k}>
                <td>
                  <span className={`badge ${SEV[i.severity][1]}`}>{SEV[i.severity][0]}</span>
                </td>
                <td className="small">{CAT[i.category] ?? i.category}</td>
                <td>
                  <div dir="auto">{i.message}</div>
                  {i.detail && (
                    <code className="small muted" dir="ltr" style={{ wordBreak: "break-all" }}>
                      {i.detail}
                    </code>
                  )}
                </td>
                <td>
                  <code className="small muted">{i.rule}</code>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
