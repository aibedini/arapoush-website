"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { ago, ROLE } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Op = { id: string; email: string; display_name: string; role: string; status: string; last_login_at: string | null; locked_until: string | null; mfa: boolean };
const ROLES = ["super_admin", "operator", "auditor", "viewer"];

export default function Operators() {
  const me = useMe();
  const admin = me?.role === "super_admin";
  const list = useApi<Op[]>("/v1/manage/operators");
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", role: "operator", password: "" });

  const patch = (o: Op, body: Record<string, unknown>, ok: string) =>
    act.run(async () => {
      await api(`/v1/manage/operators/${o.id}`, { method: "PATCH", body });
      list.reload();
    }, ok);
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      await api("/v1/manage/operators", { body: form });
      setAdding(false);
      setForm({ email: "", display_name: "", role: "operator", password: "" });
      list.reload();
    }, "اپراتور ساخته شد. در اولین ورود، احراز دومرحله‌ای را فعال می‌کند.");
  };

  return (
    <>
      <PageHead title="اپراتورها" sub="کارکنان OPEX با دسترسی به این کنسول. تغییرها به تأیید دوبارهٔ هویت نیاز دارند.">
        {admin && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            اپراتور تازه
          </button>
        )}
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        <section className="card" aria-label="فهرست اپراتورها">
          {!list.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نام</th>
                    <th>نقش</th>
                    <th>وضعیت</th>
                    <th>آخرین ورود</th>
                    {admin && <th>کارها</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((o) => {
                    const locked = o.locked_until && new Date(o.locked_until).getTime() > Date.now();
                    const self = o.id === me?.id;
                    return (
                      <tr key={o.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {o.display_name} {self && <span className="badge">شما</span>}
                          </div>
                          <code className="small muted">{o.email}</code>
                        </td>
                        <td>
                          {admin && !self ? (
                            <select aria-label={`نقش ${o.display_name}`} value={o.role} onChange={(e) => patch(o, { role: e.target.value }, "نقش تغییر کرد.")} style={{ maxInlineSize: 160 }}>
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE[r]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            ROLE[o.role] ?? o.role
                          )}
                        </td>
                        <td>
                          <div className="row">
                            {o.status === "active" ? <span className="badge ok">فعال</span> : <span className="badge bad">غیرفعال</span>}
                            {locked && <span className="badge bad">قفل</span>}
                            {o.mfa ? <span className="badge">دومرحله‌ای</span> : <span className="badge warn">بدون دومرحله‌ای</span>}
                          </div>
                        </td>
                        <td className="small muted">{ago(o.last_login_at)}</td>
                        {admin && (
                          <td>
                            <div className="row">
                              {!self && (
                                <button type="button" className={`btn sm${o.status === "active" ? " danger" : ""}`} onClick={() => patch(o, { status: o.status === "active" ? "disabled" : "active" }, "وضعیت تغییر کرد.")}>
                                  {o.status === "active" ? "غیرفعال کردن" : "فعال کردن"}
                                </button>
                              )}
                              {locked && (
                                <button type="button" className="btn sm" onClick={() => patch(o, { unlock: true }, "قفل حساب باز شد.")}>
                                  باز کردن قفل
                                </button>
                              )}
                              {o.mfa && !self && (
                                <button type="button" className="btn sm" onClick={() => confirm(`احراز دومرحله‌ای ${o.display_name} بازنشانی شود؟`) && patch(o, { reset_mfa: true }, "احراز دومرحله‌ای بازنشانی شد.")}>
                                  بازنشانی دومرحله‌ای
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <Dialog open={adding} onClose={() => setAdding(false)} title="اپراتور تازه">
        <form className="stack" onSubmit={create}>
          <label className="f">
            <span>نام</span>
            <input required minLength={2} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </label>
          <label className="f">
            <span>ایمیل</span>
            <input type="email" dir="ltr" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="f">
            <span>نقش</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            <span>رمز عبور موقت (حداقل ۱۲ نویسه)</span>
            <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <ErrorNote error={act.error} />
          <div className="row">
            <button className="btn primary" disabled={act.busy}>
              ساختن
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              انصراف
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
