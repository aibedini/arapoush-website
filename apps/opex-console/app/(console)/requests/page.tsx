"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { ago, num } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { STATE, type CrSummary } from "@/lib/cr";

const TABS = [
  { state: "pending_review", label: "در انتظار بررسی" },
  { state: "approved", label: "تأییدشده" },
  { state: "needs_rebase", label: "نیازمند به‌روزرسانی" },
  { state: "", label: "همه" },
];

export default function Requests() {
  const [tab, setTab] = useState("pending_review");
  const { data, error, loading } = useApi<CrSummary[]>(`/v1/manage/change-requests${tab ? `?state=${tab}` : ""}`);
  return (
    <>
      <PageHead title="درخواست‌های تغییر" sub="پیشنهادهای آراسی‌ام‌اس؛ هر مورد را جدا تأیید یا رد کنید، پیش از انتشار پیش‌نمایش بگیرید." />
      <div className="row" role="tablist" aria-label="وضعیت" style={{ marginBlockEnd: 12 }}>
        {TABS.map((t) => (
          <button key={t.state} type="button" role="tab" aria-selected={tab === t.state} className={`btn sm${tab === t.state ? " primary" : ""}`} onClick={() => setTab(t.state)}>
            {t.label}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      <section className="card" aria-label="درخواست‌ها">
        {loading && !data ? (
          <div className="card-body">
            <Loading />
          </div>
        ) : !data?.length ? (
          <div className="empty">درخواستی در این وضعیت نیست.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>از</th>
                  <th>محتوا</th>
                  <th>موارد</th>
                  <th>وضعیت</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/requests/${c.id}`} style={{ fontWeight: 600 }}>
                        {c.title}
                      </Link>
                      {c.four_eyes && <span className="badge accent" style={{ marginInlineStart: 6 }}>دو تأیید ({num(c.approvals)}/۲)</span>}
                    </td>
                    <td>
                      {c.author ?? "—"}
                      <div className="small muted">{c.partner ?? "اپراتور"}</div>
                    </td>
                    <td className="small">{(c.entries ?? []).map((e) => <code key={e} style={{ display: "block" }}>{e}</code>)}</td>
                    <td className="num">{num(c.items)}</td>
                    <td>
                      <span className={`badge ${STATE[c.state]?.tone ?? ""}`}>{STATE[c.state]?.label ?? c.state}</span>
                    </td>
                    <td className="small muted">{ago(c.created_at)}</td>
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
