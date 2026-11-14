"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { actionLabel, ago, num, RESULT, when } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";
import { dayEnd, GROUPS, initials, isLocked, roleLabel, StatusBadges, TempPassword, toDay, tomorrow, UserPermissions, type Catalogue, type Role } from "../_components/parts";

type Detail = {
  id: string;
  email: string | null;
  display_name: string;
  title: string | null;
  notes: string;
  role: string;
  status: string;
  mfa: boolean;
  last_login_at: string | null;
  locked_until: string | null;
  failed_logins: number;
  created_at: string;
  created_by: string | null;
  must_change_password: boolean;
  access_expires_at: string | null;
  password_changed_at: string | null;
  perm_allow: string[];
  perm_deny: string[];
  effective: string[];
  manageable: boolean;
  self: boolean;
  sessions: { id: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string }[];
};
type Event = { seq: number; ts: string; action: string; result: string; by_self: boolean; actor: string | null; ip: string | null; reason: string | null };
type Tab = "profile" | "access" | "security" | "activity";

export default function OperatorPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const op = useApi<Detail>(`/v1/manage/operators/${id}`);
  const roles = useApi<Role[]>(can(me, "roles.read") ? "/v1/manage/roles" : null);
  const [tab, setTab] = useState<Tab>("profile");
  const cat = useApi<Catalogue>(tab === "access" ? "/v1/manage/permissions" : null);
  const activity = useApi<Event[]>(tab === "activity" ? `/v1/manage/operators/${id}/activity?limit=100` : null);
  const act = useAction();
  const [issued, setIssued] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Your own account is managed on the account page.
  useEffect(() => {
    if (op.data?.self) router.replace("/account");
  }, [op.data?.self, router]);

  const o = op.data;
  const editable = !!o?.manageable && can(me, "users.update");
  const patch = (body: Record<string, unknown>, ok: string) =>
    act.run(async () => {
      await api(`/v1/manage/operators/${id}`, { method: "PATCH", body });
      op.reload();
    }, ok);
  const post = (path: string, ok: string) =>
    act.run(async () => {
      await api(`/v1/manage/operators/${id}/${path}`, { method: "POST", body: {} });
      op.reload();
    }, ok);

  if (op.error)
    return (
      <>
        <PageHead title="کاربر" />
        <ErrorNote error={op.error} />
        <Link className="btn" href="/operators">
          بازگشت به فهرست کاربران
        </Link>
      </>
    );
  if (!o) return <Loading />;
  const name = (k: string) => roleLabel(k, roles.data);

  return (
    <>
      <div className="small" style={{ marginBlockEnd: 8 }}>
        <Link href="/operators">کاربران و دسترسی‌ها</Link> / {o.display_name}
      </div>
      <PageHead title={o.display_name} sub={[o.title, name(o.role)].filter(Boolean).join(" · ")}>
        <span className="avatar lg" aria-hidden="true">
          {initials(o.display_name)}
        </span>
      </PageHead>
      <div className="row" style={{ marginBlockEnd: 12 }}>
        <code dir="ltr">{o.email}</code>
        <StatusBadges o={o} />
      </div>
      {!o.manageable && (
        <div className="note warn" role="status" style={{ marginBlockEnd: 12 }}>
          {o.role === "super_admin" ? "فقط مدیر ارشد می‌تواند مدیر ارشد دیگری را تغییر دهد." : "این کاربر دسترسی‌هایی دارد که شما ندارید؛ فقط می‌توانید مشخصاتش را ببینید."}
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="بخش‌های کاربر">
        {(
          [
            ["profile", "مشخصات"],
            ["access", "نقش و دسترسی‌ها"],
            ["security", "امنیت و نشست‌ها"],
            ["activity", "فعالیت"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid">
        <ErrorNote error={act.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}

        {tab === "profile" && <Profile o={o} editable={editable} busy={act.busy} onSave={(b) => patch(b, "مشخصات ذخیره شد.")} />}

        {tab === "access" && (
          <section className="card" aria-labelledby="acc-h">
            <div className="card-head">
              <h2 id="acc-h">نقش و دسترسی‌ها</h2>
              {editable && can(me, "users.permissions") && (
                <button type="button" className="btn" disabled={!cat.data} onClick={() => setEditPerms(true)}>
                  دسترسی‌های اختصاصی
                </button>
              )}
            </div>
            <div className="card-body stack">
              <label className="f" style={{ maxInlineSize: 320 }}>
                <span>نقش</span>
                <select value={o.role} disabled={!editable || !can(me, "users.permissions")} onChange={(e) => confirm(`نقش ${o.display_name} به «${name(e.target.value)}» تغییر کند؟`) && patch({ role: e.target.value }, "نقش تغییر کرد.")}>
                  {(roles.data?.map((r) => r.key) ?? [o.role]).map((r) => (
                    <option key={r} value={r} disabled={r === "super_admin" && me?.role !== "super_admin"}>
                      {name(r)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small muted">
                {num(o.effective.length)} دسترسی فعال · {num(o.perm_allow.length)} اجازهٔ اختصاصی · {num(o.perm_deny.length)} منع اختصاصی. تغییرها از درخواست بعدی کاربر اعمال می‌شود.
              </p>
              {cat.data ? <EffectiveList cat={cat.data} effective={o.effective} allow={o.perm_allow} deny={o.perm_deny} /> : <Loading rows={6} />}
            </div>
          </section>
        )}

        {tab === "security" && (
          <div className="cols-2">
            <section className="card" aria-labelledby="sess-h">
              <div className="card-head">
                <h2 id="sess-h">نشست‌های فعال</h2>
                {editable && (
                  <button type="button" className="btn sm danger" onClick={() => confirm(`${o.display_name} از همهٔ دستگاه‌ها خارج شود؟`) && post("sessions/revoke", "از همهٔ دستگاه‌ها خارج شد.")}>
                    خروج از همهٔ دستگاه‌ها
                  </button>
                )}
              </div>
              {!can(me, "sessions.manage") ? (
                <div className="card-body small muted">دیدن نشست‌های دیگران به دسترسی «دیدن و لغو نشست‌های دیگران» نیاز دارد.</div>
              ) : o.sessions.length === 0 ? (
                <div className="empty">نشست فعالی نیست.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>IP و مرورگر</th>
                        <th>آغاز</th>
                        <th>آخرین فعالیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.sessions.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <code>{s.ip ?? "—"}</code>
                            <div className="small muted" dir="ltr" style={{ maxInlineSize: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.user_agent ?? ""}>
                              {s.user_agent}
                            </div>
                          </td>
                          <td className="small">{when(s.created_at)}</td>
                          <td className="small muted">{ago(s.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card" aria-labelledby="sec-h">
              <div className="card-head">
                <h2 id="sec-h">ورود و احراز هویت</h2>
              </div>
              <div className="card-body stack">
                <dl className="ov-dl">
                  <div>
                    <dt>احراز دومرحله‌ای</dt>
                    <dd>{o.mfa ? "فعال" : "هنوز فعال نشده"}</dd>
                  </div>
                  <div>
                    <dt>آخرین ورود</dt>
                    <dd>{o.last_login_at ? when(o.last_login_at) : "هنوز وارد نشده"}</dd>
                  </div>
                  <div>
                    <dt>آخرین تغییر رمز</dt>
                    <dd>{when(o.password_changed_at)}</dd>
                  </div>
                  <div>
                    <dt>تلاش ناموفق پیاپی</dt>
                    <dd>{num(o.failed_logins)}</dd>
                  </div>
                  {isLocked(o) && (
                    <div>
                      <dt>قفل تا</dt>
                      <dd>{when(o.locked_until)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>رمز موقت</dt>
                    <dd>{o.must_change_password ? "بله، در ورود بعدی باید عوض شود" : "خیر"}</dd>
                  </div>
                </dl>
                {editable && (
                  <div className="stack">
                    <button type="button" className="btn" onClick={() => (act.setError(null), setResetting(true))}>
                      رمز موقت تازه
                    </button>
                    {!o.must_change_password && (
                      <button type="button" className="btn" onClick={() => patch({ must_change_password: true }, "در درخواست بعدی، کاربر باید رمزش را عوض کند.")}>
                        الزام به تغییر رمز
                      </button>
                    )}
                    {isLocked(o) && (
                      <button type="button" className="btn" onClick={() => patch({ unlock: true }, "قفل حساب باز شد.")}>
                        باز کردن قفل
                      </button>
                    )}
                    {o.mfa && (
                      <button type="button" className="btn danger" onClick={() => confirm(`احراز دومرحله‌ای ${o.display_name} بازنشانی شود؟ از همهٔ دستگاه‌ها خارج می‌شود و در ورود بعدی برنامهٔ تازه‌ای وصل می‌کند.`) && patch({ reset_mfa: true }, "احراز دومرحله‌ای بازنشانی شد.")}>
                        بازنشانی احراز دومرحله‌ای
                      </button>
                    )}
                    <p className="small muted">پیش از هر کدام، کد برنامهٔ احراز هویت خودتان خواسته می‌شود.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "activity" && (
          <section className="card" aria-labelledby="act-h">
            <div className="card-head">
              <h2 id="act-h">فعالیت اخیر</h2>
              {can(me, "audit.read") && (
                <Link className="btn sm" href="/audit">
                  گزارش کامل ممیزی
                </Link>
              )}
            </div>
            {!activity.data ? (
              <div className="card-body">
                <Loading />
              </div>
            ) : activity.data.length === 0 ? (
              <div className="empty">رویدادی ثبت نشده.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>زمان</th>
                      <th>رویداد</th>
                      <th>انجام‌دهنده</th>
                      <th>نتیجه</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.data.map((e) => (
                      <tr key={e.seq}>
                        <td className="small">{when(e.ts)}</td>
                        <td>
                          {actionLabel(e.action)}
                          {e.reason && <div className="small muted">{e.reason}</div>}
                        </td>
                        <td className="small">{e.by_self ? "خودش" : (e.actor ?? "سیستم")}</td>
                        <td>
                          <span className={`badge${e.result === "success" ? "" : " bad"}`}>{RESULT[e.result] ?? e.result}</span>
                        </td>
                        <td>
                          <code className="small">{e.ip ?? "—"}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "profile" && (editable || (o.manageable && can(me, "users.delete"))) && (
          <section className="card" aria-labelledby="danger-h">
            <div className="card-head">
              <h2 id="danger-h">وضعیت حساب</h2>
            </div>
            <div className="card-body stack">
              {editable && (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{o.status === "active" ? "غیرفعال کردن" : "فعال کردن دوباره"}</div>
                    <div className="small muted">{o.status === "active" ? "ورود بسته می‌شود و نشست‌ها پایان می‌یابند؛ همه‌چیز برای فعال‌سازی دوباره می‌ماند." : "کاربر دوباره می‌تواند وارد شود."}</div>
                  </div>
                  <button
                    type="button"
                    className={`btn${o.status === "active" ? " danger" : ""}`}
                    onClick={() => (o.status !== "active" || confirm(`${o.display_name} غیرفعال شود؟`)) && patch({ status: o.status === "active" ? "disabled" : "active" }, o.status === "active" ? "حساب غیرفعال شد." : "حساب فعال شد.")}
                  >
                    {o.status === "active" ? "غیرفعال کردن" : "فعال کردن"}
                  </button>
                </div>
              )}
              {o.manageable && can(me, "users.delete") && (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--bad)" }}>حذف کاربر</div>
                    <div className="small muted">ورود برای همیشه حذف می‌شود و ایمیل آزاد می‌شود. نام او در گزارش ممیزی و کارهای گذشته می‌ماند. برگشت‌پذیر نیست.</div>
                  </div>
                  <button type="button" className="btn danger" onClick={() => (act.setError(null), setDeleting(true))}>
                    حذف…
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {editPerms && cat.data && (
        <UserPermissions
          op={o}
          cat={cat.data}
          rolePerms={o.role === "super_admin" ? cat.data.permissions.map((p) => p.key) : (roles.data?.find((r) => r.key === o.role)?.permissions ?? cat.data.builtin.find((b) => b.key === o.role)?.permissions ?? [])}
          roleName={name(o.role)}
          onClose={() => setEditPerms(false)}
          onSaved={() => {
            setEditPerms(false);
            op.reload();
            act.setDone("دسترسی‌ها ذخیره شد.");
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          id={o.id}
          name={o.display_name}
          onClose={() => setResetting(false)}
          onDone={(pw) => {
            setResetting(false);
            op.reload();
            if (pw) setIssued(pw);
            else act.setDone("رمز موقت گذاشته شد؛ کاربر از همهٔ دستگاه‌ها خارج شد.");
          }}
        />
      )}
      {issued && <TempPassword email={o.email} password={issued} onDone={() => setIssued(null)} />}
      {deleting && <DeleteOperator o={o} onClose={() => setDeleting(false)} onDeleted={() => router.replace("/operators")} />}
    </>
  );
}

function Profile({ o, editable, busy, onSave }: { o: Detail; editable: boolean; busy: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const initial = useMemo(() => ({ display_name: o.display_name, email: o.email ?? "", title: o.title ?? "", notes: o.notes, expires: toDay(o.access_expires_at) }), [o]);
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const changed: Record<string, unknown> = {};
  if (f.display_name !== initial.display_name) changed.display_name = f.display_name;
  if (f.email !== initial.email) changed.email = f.email;
  if (f.title !== initial.title) changed.title = f.title || null;
  if (f.notes !== initial.notes) changed.notes = f.notes;
  if (f.expires !== initial.expires) changed.access_expires_at = dayEnd(f.expires);
  const dirty = Object.keys(changed).length > 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (changed.email && !confirm("با تغییر ایمیل، کاربر از همهٔ دستگاه‌ها خارج می‌شود و باید با ایمیل تازه وارد شود. ادامه می‌دهید؟")) return;
    onSave(changed);
  };
  return (
    <div className="cols-2">
      <section className="card" aria-labelledby="prof-h">
        <div className="card-head">
          <h2 id="prof-h">مشخصات</h2>
        </div>
        <form className="card-body stack" onSubmit={submit}>
          <label className="f">
            <span>نام و نام خانوادگی</span>
            <input required minLength={2} maxLength={120} disabled={!editable} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
          </label>
          <label className="f">
            <span>ایمیل (برای ورود)</span>
            <input type="email" dir="ltr" required disabled={!editable} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </label>
          <label className="f">
            <span>سمت</span>
            <input maxLength={120} disabled={!editable} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="f">
            <span>پایان دسترسی</span>
            <div className="row">
              <input type="date" dir="ltr" min={tomorrow()} disabled={!editable} value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} style={{ maxInlineSize: 200 }} />
              {f.expires && editable && (
                <button type="button" className="btn sm ghost" onClick={() => setF({ ...f, expires: "" })}>
                  بدون محدودیت
                </button>
              )}
            </div>
            <span className="small muted">پس از این روز ورود بسته می‌شود و نشست‌های باز هم پایان می‌یابند.</span>
          </label>
          {editable && (
            <label className="f">
              <span>یادداشت مدیر (فقط مدیران کاربران آن را می‌بینند)</span>
              <textarea rows={3} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </label>
          )}
          {editable && (
            <div className="row">
              <button className="btn primary" disabled={busy || !dirty}>
                ذخیره
              </button>
              {dirty && (
                <button type="button" className="btn" onClick={() => setF(initial)}>
                  برگرداندن
                </button>
              )}
            </div>
          )}
        </form>
      </section>
      <section className="card" aria-labelledby="meta-h">
        <div className="card-head">
          <h2 id="meta-h">سابقه</h2>
        </div>
        <div className="card-body">
          <dl className="ov-dl">
            <div>
              <dt>ساخته شده</dt>
              <dd>{when(o.created_at)}</dd>
            </div>
            <div>
              <dt>به دست</dt>
              <dd>{o.created_by === "cli" ? "نصب‌کننده (خط فرمان)" : (o.created_by ?? "—")}</dd>
            </div>
            <div>
              <dt>آخرین ورود</dt>
              <dd>{o.last_login_at ? ago(o.last_login_at) : "هنوز وارد نشده"}</dd>
            </div>
            <div>
              <dt>دسترسی تا</dt>
              <dd>{o.access_expires_at ? when(o.access_expires_at) : "بدون محدودیت"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

/** Read-only view of what the operator can do, grouped like the editor. */
function EffectiveList({ cat, effective, allow, deny }: { cat: Catalogue; effective: string[]; allow: string[]; deny: string[] }) {
  const on = new Set(effective);
  const groups: Record<string, Catalogue["permissions"]> = {};
  for (const p of cat.permissions) (groups[p.group] ??= []).push(p);
  return (
    <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {Object.entries(groups).map(([g, perms]) => (
        <div key={g} className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBlockEnd: 6 }}>
            {GROUPS[g] ?? g} <span className="small muted">({num(perms.filter((p) => on.has(p.key)).length)}/{num(perms.length)})</span>
          </div>
          <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {perms.map((p) => (
              <li key={p.key} style={{ color: on.has(p.key) ? undefined : "var(--muted)", textDecoration: on.has(p.key) ? undefined : "line-through" }}>
                {p.label.fa}
                {allow.includes(p.key) && <span className="badge ok"> اجازهٔ اختصاصی</span>}
                {deny.includes(p.key) && <span className="badge bad"> منع اختصاصی</span>}
                {!on.has(p.key) && <span className="sr-only"> (ندارد)</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ResetPassword({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: (generated: string | null) => void }) {
  const act = useAction();
  const [manual, setManual] = useState(false);
  const [pw, setPw] = useState({ password: "", again: "" });
  const mismatch = manual && pw.password !== pw.again;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    act.run(async () => {
      const r = await api<{ ok: true; temporaryPassword?: string }>(`/v1/manage/operators/${id}/reset-password`, { body: manual ? { password: pw.password } : {} });
      onDone(r.temporaryPassword ?? null);
    });
  };
  return (
    <Dialog open onClose={onClose} title={`رمز موقت تازه برای ${name}`}>
      <form className="stack" onSubmit={submit}>
        <p className="small muted">کاربر از همهٔ دستگاه‌ها خارج می‌شود، قفل حسابش باز می‌شود و در ورود بعدی باید رمز خودش را بگذارد. احراز دومرحله‌ای‌اش دست نمی‌خورد.</p>
        <label className="check">
          <input type="radio" name="rpw" checked={!manual} onChange={() => setManual(false)} />
          ساخت خودکار رمز قوی (پیشنهادی)
        </label>
        <label className="check">
          <input type="radio" name="rpw" checked={manual} onChange={() => setManual(true)} />
          خودم وارد می‌کنم
        </label>
        {manual && (
          <>
            <label className="f">
              <span>رمز موقت (حداقل ۱۲ نویسه)</span>
              <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
            </label>
            <label className="f">
              <span>تکرار رمز</span>
              <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} aria-invalid={mismatch} />
              {mismatch && pw.again.length > 0 && <span className="small" style={{ color: "var(--bad)" }}>تکرار رمز یکسان نیست.</span>}
            </label>
          </>
        )}
        <ErrorNote error={act.error} />
        <div className="row">
          <button className="btn primary" disabled={act.busy || mismatch}>
            گذاشتن رمز موقت
          </button>
          <button type="button" className="btn" onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Deleting asks for the email typed back, so it is never a slip of the mouse. */
function DeleteOperator({ o, onClose, onDeleted }: { o: Detail; onClose: () => void; onDeleted: () => void }) {
  const act = useAction();
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === (o.email ?? "").toLowerCase();
  return (
    <Dialog open onClose={onClose} title={`حذف ${o.display_name}`}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          act.run(async () => {
            await api(`/v1/manage/operators/${o.id}`, { method: "DELETE" });
            onDeleted();
          });
        }}
      >
        <div className="note bad">ورود این کاربر برای همیشه حذف می‌شود: رمز، احراز دومرحله‌ای، نشست‌ها و عضویت در تیم‌ها. اگر شاید برگردد، به‌جای حذف «غیرفعال» کنید.</div>
        <label className="f">
          <span>
            برای تأیید، ایمیل کاربر را بنویسید: <code dir="ltr">{o.email}</code>
          </span>
          <input dir="ltr" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <ErrorNote error={act.error} />
        <div className="row">
          <button className="btn danger" disabled={!ok || act.busy}>
            حذف برای همیشه
          </button>
          <button type="button" className="btn" onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Dialog>
  );
}
