"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { actionLabel, ago, num, RESULT } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type Dash = {
  crs: { pending?: number; rebase?: number; approved7d?: number };
  entries: { total?: number; unpublished?: number; scheduled?: number };
  security24h: { failed_logins?: number; denies?: number; lockouts?: number };
  webhooks: { retrying?: number; dead?: number };
  tickets?: { open?: number; new?: number; unassigned?: number; overdue?: number; week?: number };
  auditHead: { seq?: string; hash?: string };
  recent: { seq: number; ts: string; action: string; result: string; who: string | null; kind: string; ip: string | null; resource: Record<string, unknown> | null }[];
};

function Stat({ k, v, s, tone, href }: { k: string; v: number | undefined; s?: string; tone?: "bad" | "warn"; href?: string }) {
  const body = (
    <>
      <div className="k">{k}</div>
      <div className="v">{num(v ?? 0)}</div>
      {s && <div className="s">{s}</div>}
    </>
  );
  return (
    <div className="card stat" data-tone={v ? tone : undefined}>
      {href ? (
        <Link href={href} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data, error, loading } = useApi<Dash>("/v1/manage/dashboard");
  return (
    <>
      <PageHead title="داشبورد" sub="وضعیت محتوا، درخواست‌های تغییر و امنیت در یک نگاه" />
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading rows={6} />
      ) : (
        data && (
          <div className="grid">
            <div className="stats">
              <Stat k="درخواست‌های در انتظار بررسی" v={data.crs.pending} s={`${num(data.crs.rebase ?? 0)} نیازمند به‌روزرسانی`} tone="warn" />
              <Stat k="محتوای منتشرنشده" v={data.entries.unpublished} s={`از ${num(data.entries.total ?? 0)} محتوا`} tone="warn" href="/content" />
              <Stat k="انتشار زمان‌بندی‌شده" v={data.entries.scheduled} href="/content" />
              <Stat k="تیکت‌های باز" v={data.tickets?.open} s={`${num(data.tickets?.new ?? 0)} تازه · ${num(data.tickets?.unassigned ?? 0)} بدون مسئول · ${num(data.tickets?.week ?? 0)} در ۷ روز`} tone="warn" href="/tickets" />
              <Stat k="تیکت‌های عقب از SLA" v={data.tickets?.overdue} tone="bad" href="/tickets?view=overdue" />
              <Stat k="ورود ناموفق (۲۴ ساعت)" v={data.security24h.failed_logins} s={`${num(data.security24h.lockouts ?? 0)} قفل حساب`} tone="bad" href="/audit?action=*failure" />
              <Stat k="دسترسی‌های ردشده (۲۴ ساعت)" v={data.security24h.denies} tone="bad" href="/audit?result=denied" />
              <Stat k="وب‌هوک‌های ناموفق" v={(data.webhooks.dead ?? 0) + (data.webhooks.retrying ?? 0)} s={`${num(data.webhooks.dead ?? 0)} متوقف`} tone="bad" />
            </div>
            <div className="cols-2">
              <section className="card" aria-labelledby="recent-h">
                <div className="card-head">
                  <h2 id="recent-h">آخرین رویدادها</h2>
                  <Link className="btn sm" href="/audit">
                    همهٔ رویدادها
                  </Link>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>رویداد</th>
                        <th>چه کسی</th>
                        <th>IP</th>
                        <th>زمان</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r) => (
                        <tr key={r.seq}>
                          <td>
                            <div className="row">
                              {actionLabel(r.action)}
                              {r.result !== "success" && <span className={`badge ${r.result === "denied" ? "bad" : "warn"}`}>{RESULT[r.result]}</span>}
                            </div>
                          </td>
                          <td>{r.who ?? <span className="muted">{r.kind}</span>}</td>
                          <td>
                            <code>{r.ip ?? "—"}</code>
                          </td>
                          <td className="muted small" title={r.ts}>
                            {ago(r.ts)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card" aria-labelledby="chain-h">
                <div className="card-head">
                  <h2 id="chain-h">زنجیرهٔ گزارش</h2>
                </div>
                <div className="card-body stack">
                  <p className="muted small">هر رویداد با هش رویداد قبلی زنجیر شده است؛ هر تغییر یا حذف در پایگاه داده زنجیره را می‌شکند.</p>
                  <div>
                    <div className="small muted">آخرین شماره</div>
                    <div style={{ fontWeight: 700 }}>{num(data.auditHead.seq ?? 0)}</div>
                  </div>
                  <div>
                    <div className="small muted">هش</div>
                    <code style={{ wordBreak: "break-all" }}>{data.auditHead.hash ?? "—"}</code>
                  </div>
                  <Link className="btn sm" href="/audit#verify">
                    بررسی زنجیره
                  </Link>
                </div>
              </section>
            </div>
          </div>
        )
      )}
    </>
  );
}
