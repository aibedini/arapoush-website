"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { ago, ROLE, when } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type Session = { id: string; kind: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string; expires_at: string; client_id: string | null; display_name: string; principal_kind: string };

export default function Account() {
  const me = useMe();
  const admin = me?.role === "super_admin";
  const [all, setAll] = useState(false);
  const sessions = useApi<Session[]>(`/v1/manage/sessions${all ? "?all=1" : ""}`);
  const act = useAction();
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const forced = !!me?.mustChangePassword;

  const revoke = (s: Session) =>
    act.run(async () => {
      await api(`/v1/manage/sessions/${s.id}/revoke`, { method: "POST" });
      sessions.reload();
    }, "نشست پایان یافت.");
  const change = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.again) return act.setError(new ApiError(0, "MISMATCH", "تکرار رمز تازه یکسان نیست."));
    act.run(async () => {
      // A step-up is asked for by the shell's dialog only when the last one is older than 5 minutes.
      await api("/v1/manage/auth/password", { body: { current: pw.current, next: pw.next } });
      setPw({ current: "", next: "", again: "" });
      // The temporary-password lock is lifted: load the console with the full menu.
      if (forced) location.assign("/");
      else sessions.reload();
    }, "رمز عبور تغییر کرد و نشست‌های دیگر شما پایان یافت.");
  };

  return (
    <>
      <PageHead title="حساب من" sub={me ? `${me.display} · ${ROLE[me.role] ?? me.role}` : undefined} />
      <div className="grid">
        {forced && (
          <div className="note warn" role="alert">
            با رمز موقت وارد شده‌اید. برای دسترسی به بخش‌های کنسول، اول رمز خودتان را بگذارید: «رمز فعلی» همان رمز موقتی است که به شما داده‌اند.
          </div>
        )}
        <ErrorNote error={act.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        <div className="cols-2">
          <section className="card" aria-labelledby="sess-h">
            <div className="card-head">
              <h2 id="sess-h">نشست‌های فعال</h2>
              {admin && (
                <label className="check small">
                  <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
                  همهٔ کاربران (اپراتورها و آراسی‌ام‌اس)
                </label>
              )}
            </div>
            {!sessions.data ? (
              <div className="card-body">
                <Loading />
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {all && <th>کاربر</th>}
                      <th>IP و مرورگر</th>
                      <th>آغاز</th>
                      <th>آخرین فعالیت</th>
                      <th>
                        <span className="sr-only">کار</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.data.map((s) => (
                      <tr key={s.id}>
                        {all && (
                          <td>
                            {s.display_name}
                            <div className="small muted">{s.client_id ?? s.principal_kind}</div>
                          </td>
                        )}
                        <td>
                          <code>{s.ip ?? "—"}</code>
                          <div className="small muted" style={{ maxInlineSize: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dir="ltr" title={s.user_agent ?? ""}>
                            {s.user_agent}
                          </div>
                        </td>
                        <td className="small">{when(s.created_at)}</td>
                        <td className="small muted">{ago(s.last_seen_at)}</td>
                        <td>
                          <button type="button" className="btn sm danger" onClick={() => revoke(s)}>
                            پایان
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card" aria-labelledby="pw-h">
            <div className="card-head">
              <h2 id="pw-h">تغییر رمز عبور</h2>
            </div>
            <form className="card-body stack" onSubmit={change}>
              <label className="f">
                <span>رمز فعلی</span>
                <input type="password" dir="ltr" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </label>
              <label className="f">
                <span>رمز تازه (حداقل ۱۲ نویسه)</span>
                <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </label>
              <label className="f">
                <span>تکرار رمز تازه</span>
                <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
              </label>
              <button className="btn primary" disabled={act.busy}>
                تغییر رمز
              </button>
              <p className="small muted">اگر بیش از ۵ دقیقه از ورود یا آخرین تأیید گذشته باشد، کد برنامهٔ احراز هویت هم خواسته می‌شود. رمزی بلند و تازه بگذارید (یک جملهٔ چندکلمه‌ای خوب است).</p>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
