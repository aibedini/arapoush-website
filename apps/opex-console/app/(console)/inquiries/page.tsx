"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { LOCALE_LABEL, ago, when } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Row = { id: string; form: string; created_at: string; handled_at: string | null; handled_by: string | null; summary: { subject?: string; page?: string; locale?: string }; name: string; email: string; company: string | null };
type Detail = {
  id: string;
  form: string;
  created_at: string;
  handled_at: string | null;
  ip: string | null;
  data: { locale: string; page: string; subject: string; spec: string[]; fields: Record<string, string | undefined> };
  emails: { status: string; attempt: number; last_error: string | null }[];
};
const FIELD: Record<string, string> = { name: "نام", company: "شرکت", email: "ایمیل", phone: "تلفن", mobile: "موبایل", quantity: "تعداد", message: "پیام" };
const EMAIL: Record<string, [string, string]> = { pending: ["در صف ارسال", "warn"], sent: ["ایمیل شد", "ok"], dead: ["ارسال نشد", "bad"] };

/** Quote and contact requests from the website. Personal data: every view is recorded in the audit log. */
export default function Inquiries() {
  const me = useMe();
  const [tab, setTab] = useState<"0" | "1" | "">("0");
  const list = useApi<Row[]>(`/v1/manage/inquiries${tab ? `?handled=${tab}` : ""}`);
  const [open, setOpen] = useState<Detail | null>(null);
  const act = useAction();
  const view = (id: string) => act.run(async () => setOpen(await api<Detail>(`/v1/manage/inquiries/${id}`)));
  const mark = (id: string, handled: boolean) =>
    act.run(async () => {
      await api(`/v1/manage/inquiries/${id}/handled`, { body: { handled } });
      setOpen(null);
      list.reload();
    }, handled ? "پیگیری‌شده علامت خورد." : "دوباره باز شد.");
  const erase = (id: string) => {
    const reason = prompt("دلیل حذف (مثلاً درخواست بازدیدکننده):");
    if (!reason) return;
    act.run(async () => {
      await api(`/v1/manage/inquiries/${id}`, { method: "DELETE", body: { reason } });
      setOpen(null);
      list.reload();
    }, "درخواست برای همیشه حذف شد؛ این حذف در گزارش ثبت شد.");
  };

  return (
    <>
      <PageHead title="درخواست‌های سایت" sub="درخواست قیمت و تماس از فرم‌های سایت. اطلاعات شخصی رمزگذاری شده و هر بار دیدن آن ثبت می‌شود؛ پس از دو سال حذف می‌شود." />
      <div className="row" role="tablist" aria-label="وضعیت" style={{ marginBlockEnd: 12 }}>
        {([["0", "پیگیری‌نشده"], ["1", "پیگیری‌شده"], ["", "همه"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn sm${tab === k ? " primary" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <ErrorNote error={act.error ?? list.error} />
      {act.done && <div className="note ok" role="status" style={{ marginBlockEnd: 12 }}>{act.done}</div>}
      <section className="card" aria-label="درخواست‌ها">
        {!list.data ? (
          <div className="card-body"><Loading /></div>
        ) : !list.data.length ? (
          <div className="empty">درخواستی نیست.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>از</th><th>موضوع</th><th>صفحه</th><th>زمان</th><th>وضعیت</th><th><span className="sr-only">کار</span></th></tr>
              </thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <bdi>{r.name}</bdi>
                      {r.company && <div className="small muted"><bdi>{r.company}</bdi></div>}
                      <code className="small">{r.email}</code>
                    </td>
                    <td dir="auto">{r.summary.subject}</td>
                    <td className="small"><code>{r.summary.page}</code></td>
                    <td className="small muted" title={when(r.created_at)}>{ago(r.created_at)}</td>
                    <td>{r.handled_at ? <span className="badge ok">پیگیری شد · {r.handled_by}</span> : <span className="badge warn">جدید</span>}</td>
                    <td><button type="button" className="btn sm" onClick={() => view(r.id)}>نمایش</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={!!open} onClose={() => setOpen(null)} title="درخواست سایت" wide>
        {open && (
          <div className="stack">
            <div className="row small muted">
              <span>{when(open.created_at)}</span>
              <span>· {LOCALE_LABEL[open.data.locale] ?? open.data.locale}</span>
              <span>· <code>{open.data.page}</code></span>
              {open.ip && <span>· IP <code>{open.ip}</code></span>}
              {open.emails.map((e, i) => <span key={i} className={`badge ${EMAIL[e.status]?.[1] ?? ""}`} title={e.last_error ?? undefined}>{EMAIL[e.status]?.[0] ?? e.status}</span>)}
            </div>
            <h3 dir="auto">{open.data.subject}</h3>
            {open.data.spec.length > 0 && <ul className="small" dir="auto" style={{ margin: 0 }}>{open.data.spec.map((s) => <li key={s}>{s}</li>)}</ul>}
            <table>
              <tbody>
                {Object.entries(open.data.fields).filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}>
                    <th style={{ inlineSize: 120 }}>{FIELD[k] ?? k}</th>
                    <td dir="auto" style={{ whiteSpace: "pre-wrap" }}>{k === "email" ? <a href={`mailto:${v}`}>{v}</a> : v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              {open.handled_at ? (
                <button type="button" className="btn" onClick={() => mark(open.id, false)} disabled={act.busy}>بازکردن دوباره</button>
              ) : (
                <button type="button" className="btn primary" onClick={() => mark(open.id, true)} disabled={act.busy}>پیگیری شد</button>
              )}
              {me?.role === "super_admin" && <button type="button" className="btn danger" onClick={() => erase(open.id)} disabled={act.busy}>حذف همیشگی</button>}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
