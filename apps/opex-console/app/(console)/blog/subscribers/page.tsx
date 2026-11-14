"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { num, when } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { LOCALE_NAME } from "../_components/lib";

type Sub = { id: string; email: string; locale: "fa" | "en" | "tr"; status: "pending" | "confirmed" | "unsubscribed"; createdAt: string; confirmedAt: string | null };
const STATUS: Record<Sub["status"], [string, string]> = { pending: ["منتظر تأیید", "warn"], confirmed: ["عضو", "ok"], unsubscribed: ["لغوشده", ""] };

/** Newsletter subscribers (double opt-in), CSV export and removal on request. */
export default function BlogSubscribers() {
  const list = useApi<{ items: Sub[]; confirmed: number }>("/v1/manage/blog/subscribers");
  const act = useAction();
  const [q, setQ] = useState("");
  const items = useMemo(() => (list.data?.items ?? []).filter((s) => !q || s.email.includes(q.toLowerCase())), [list.data, q]);
  const csv = () => {
    const rows = [["email", "locale", "status", "subscribed", "confirmed"], ...(list.data?.items ?? []).filter((s) => s.status === "confirmed").map((s) => [s.email, s.locale, s.status, s.createdAt, s.confirmedAt ?? ""])];
    const blob = new Blob([rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "arapoush-newsletter.csv" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="small" style={{ marginBlockEnd: 8 }}>
        <Link href="/blog">بلاگ</Link> / خبرنامه
      </div>
      <PageHead title="مشترکان خبرنامه" sub={list.data ? `${num(list.data.confirmed)} عضو تأییدشده. عضویت دومرحله‌ای است: فقط کسانی که پیوند ایمیل را تأیید کرده‌اند ایمیل می‌گیرند.` : undefined}>
        <button type="button" className="btn" onClick={csv} disabled={!list.data?.confirmed}>
          خروجی CSV (اعضای تأییدشده)
        </button>
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error} />
        <section className="card" aria-label="فهرست مشترکان">
          <div className="card-body">
            <label className="f" style={{ maxInlineSize: 320 }}>
              <span>جست‌وجوی ایمیل</span>
              <input type="search" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {!list.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : items.length === 0 ? (
            <div className="empty">هنوز مشترکی نیست.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ایمیل</th>
                    <th>زبان</th>
                    <th>وضعیت</th>
                    <th>عضویت</th>
                    <th>
                      <span className="sr-only">کار</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <code dir="ltr">{s.email}</code>
                      </td>
                      <td className="small">{LOCALE_NAME[s.locale]}</td>
                      <td>
                        <span className={`badge ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>
                      </td>
                      <td className="small muted">{when(s.confirmedAt ?? s.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() =>
                            confirm(`${s.email} برای همیشه حذف شود؟`) &&
                            act.run(async () => {
                              await api(`/v1/manage/blog/subscribers/${s.id}`, { method: "DELETE" });
                              list.reload();
                            })
                          }
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
