"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, num } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";
import { dayEnd, initials, isExpired, isLocked, RoleEditor, roleLabel, StatusBadges, TempPassword, tomorrow, type Catalogue, type Op, type Role } from "./_components/parts";

type Filter = "all" | "active" | "disabled" | "locked" | "nomfa" | "temp" | "expired";
const FILTERS: [Filter, string][] = [
  ["all", "همه"],
  ["active", "فعال"],
  ["disabled", "غیرفعال"],
  ["locked", "قفل‌شده"],
  ["nomfa", "بدون دومرحله‌ای"],
  ["temp", "با رمز موقت"],
  ["expired", "دسترسی تمام‌شده"],
];
const test = (o: Op, f: Filter) =>
  f === "all" ||
  (f === "active" && o.status === "active" && !isLocked(o) && !isExpired(o)) ||
  (f === "disabled" && o.status !== "active") ||
  (f === "locked" && isLocked(o)) ||
  (f === "nomfa" && !o.mfa) ||
  (f === "temp" && o.must_change_password) ||
  (f === "expired" && isExpired(o));

const EMPTY = { email: "", display_name: "", title: "", role: "operator", password: "", manual: false, must_change_password: true, expires: "" };

/** S1: users, roles and per-user permissions for every console function. */
export default function Operators() {
  const me = useMe();
  const [tab, setTab] = useState<"users" | "roles">("users");
  const list = useApi<Op[]>("/v1/manage/operators");
  const roles = useApi<Role[]>(can(me, "roles.read") ? "/v1/manage/roles" : null);
  const cat = useApi<Catalogue>(tab === "roles" ? "/v1/manage/permissions" : null);
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [issued, setIssued] = useState<{ id: string; email: string; password: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<Partial<Role> | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const roleKeys = roles.data?.map((r) => r.key) ?? ["super_admin", "operator", "auditor", "viewer"];
  const name = (k: string) => roleLabel(k, roles.data);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((o) => (!role || o.role === role) && test(o, filter) && (!needle || [o.display_name, o.email ?? "", o.title ?? ""].some((v) => v.toLowerCase().includes(needle))));
  }, [all, q, role, filter]);
  const count = (f: Filter) => all.filter((o) => test(o, f)).length;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      const body = {
        email: form.email,
        display_name: form.display_name,
        role: form.role,
        must_change_password: form.must_change_password,
        ...(form.title ? { title: form.title } : {}),
        ...(form.expires ? { access_expires_at: dayEnd(form.expires) } : {}),
        ...(form.manual ? { password: form.password } : {}),
      };
      const r = await api<{ id: string; temporaryPassword?: string }>("/v1/manage/operators", { body });
      setAdding(false);
      if (r.temporaryPassword) setIssued({ id: r.id, email: form.email.toLowerCase(), password: r.temporaryPassword });
      setForm(EMPTY);
      list.reload();
      roles.reload();
    }, "کاربر ساخته شد.");
  };

  return (
    <>
      <PageHead title="کاربران و دسترسی‌ها" sub="هر کار کنسول یک دسترسی دارد. نقش مجموعه‌ای از دسترسی‌هاست و برای هر کاربر می‌توان دسترسی جدا داد یا گرفت. کارهای حساس به تأیید دوبارهٔ هویت نیاز دارند.">
        {can(me, "users.create") && tab === "users" && (
          <button type="button" className="btn primary" onClick={() => (act.setError(null), setAdding(true))}>
            کاربر تازه
          </button>
        )}
        {can(me, "roles.manage") && tab === "roles" && (
          <button type="button" className="btn primary" onClick={() => setRoleEdit({ key: "", name: "", description: "", permissions: [] })}>
            نقش تازه
          </button>
        )}
      </PageHead>
      <div className="tabs" role="tablist" aria-label="بخش‌ها">
        <button type="button" role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")}>
          کاربران {list.data && `(${num(all.length)})`}
        </button>
        {can(me, "roles.read") && (
          <button type="button" role="tab" aria-selected={tab === "roles"} onClick={() => setTab("roles")}>
            نقش‌ها {roles.data && `(${num(roles.data.length)})`}
          </button>
        )}
      </div>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        {tab === "users" ? (
          <>
            <div className="stats">
              <Stat k="همهٔ کاربران" v={all.length} />
              <Stat k="فعال" v={count("active")} />
              <Stat k="بدون دومرحله‌ای" v={count("nomfa")} tone={count("nomfa") ? "warn" : undefined} />
              <Stat k="قفل یا تمام‌شده" v={count("locked") + count("expired")} tone={count("locked") + count("expired") ? "bad" : undefined} />
            </div>
            <section className="card" aria-label="فهرست کاربران">
              <div className="card-body filters">
                <label className="f">
                  <span>جست‌وجو</span>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، ایمیل یا سمت" />
                </label>
                <label className="f">
                  <span>نقش</span>
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="">همهٔ نقش‌ها</option>
                    {roleKeys.map((r) => (
                      <option key={r} value={r}>
                        {name(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>وضعیت</span>
                  <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                    {FILTERS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l} ({num(count(k))})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!list.data ? (
                <div className="card-body">
                  <Loading />
                </div>
              ) : shown.length === 0 ? (
                <div className="empty">{all.length ? "کاربری با این فیلترها پیدا نشد." : "هنوز کاربری نیست."}</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>کاربر</th>
                        <th>نقش</th>
                        <th>وضعیت</th>
                        <th>آخرین ورود</th>
                        <th>نشست فعال</th>
                        <th>
                          <span className="sr-only">کار</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((o) => {
                        const own = (o.perm_allow?.length ?? 0) + (o.perm_deny?.length ?? 0);
                        return (
                          <tr key={o.id}>
                            <td>
                              <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                                <span className="avatar" aria-hidden="true">
                                  {initials(o.display_name)}
                                </span>
                                <div>
                                  <div style={{ fontWeight: 600 }}>
                                    {o.display_name} {o.id === me?.id && <span className="badge accent">شما</span>}
                                  </div>
                                  {o.title && <div className="small muted">{o.title}</div>}
                                  <code className="small muted" dir="ltr" style={{ whiteSpace: "nowrap" }}>
                                    {o.email}
                                  </code>
                                </div>
                              </div>
                            </td>
                            <td>
                              {name(o.role)}
                              {own > 0 && <div className="small muted">{num(own)} دسترسی اختصاصی</div>}
                            </td>
                            <td>
                              <StatusBadges o={o} />
                              {o.access_expires_at && !isExpired(o) && <div className="small muted">تا {new Date(o.access_expires_at).toLocaleDateString("fa-IR")}</div>}
                            </td>
                            <td className="small muted">{o.last_login_at ? ago(o.last_login_at) : "هنوز وارد نشده"}</td>
                            <td className="small">{num(o.active_sessions)}</td>
                            <td>
                              <Link className="btn sm" href={o.id === me?.id ? "/account" : `/operators/${o.id}`}>
                                {o.id === me?.id ? "حساب من" : "مدیریت"}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="card" aria-label="نقش‌ها">
            {!roles.data ? (
              <div className="card-body">
                <Loading />
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>نقش</th>
                      <th>دسترسی‌ها</th>
                      <th>کاربران</th>
                      <th>کارها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.data.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{name(r.key)}</div>
                          <code className="small muted">{r.key}</code> {r.builtin && <span className="badge">پیش‌فرض</span>}
                          {!r.builtin && r.description && <div className="small muted">{r.description}</div>}
                        </td>
                        <td className="small">{r.key === "super_admin" ? "همه" : num(r.permissions.length)}</td>
                        <td>{num(r.members)}</td>
                        <td>
                          <div className="row">
                            <button type="button" className="btn sm" onClick={() => setRoleEdit(r)} disabled={!cat.data || (r.builtin && r.key === "super_admin")}>
                              {r.builtin || !can(me, "roles.manage") ? "دیدن" : "ویرایش"}
                            </button>
                            {!r.builtin && can(me, "roles.manage") && (
                              <button
                                type="button"
                                className="btn sm danger"
                                disabled={r.members > 0}
                                title={r.members > 0 ? "اول نقش کاربرانش را عوض کنید" : undefined}
                                onClick={() =>
                                  confirm(`نقش «${r.name}» حذف شود؟`) &&
                                  act.run(async () => {
                                    await api(`/v1/manage/roles/${r.key}`, { method: "DELETE" });
                                    roles.reload();
                                  }, "نقش حذف شد.")
                                }
                              >
                                حذف
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="کاربر تازه">
        <form className="stack" onSubmit={create}>
          <label className="f">
            <span>نام و نام خانوادگی</span>
            <input required minLength={2} maxLength={120} autoComplete="off" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </label>
          <label className="f">
            <span>ایمیل (برای ورود)</span>
            <input type="email" dir="ltr" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="f">
            <span>سمت (اختیاری)</span>
            <input maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="f">
            <span>نقش</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleKeys.map((r) => (
                <option key={r} value={r} disabled={r === "super_admin" && me?.role !== "super_admin"}>
                  {name(r)}
                </option>
              ))}
            </select>
            <span className="small muted">دسترسی‌های جدا را بعد از ساختن، در صفحهٔ همان کاربر تنظیم کنید.</span>
          </label>
          <label className="f">
            <span>پایان دسترسی (اختیاری، برای همکار موقت)</span>
            <input type="date" dir="ltr" min={tomorrow()} value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
          </label>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 600, marginBlockEnd: 6 }}>
              رمز اولیه
            </legend>
            <label className="check">
              <input type="radio" name="pw" checked={!form.manual} onChange={() => setForm({ ...form, manual: false })} />
              ساخت خودکار رمز قوی (پیشنهادی؛ یک بار نشان داده می‌شود)
            </label>
            <label className="check">
              <input type="radio" name="pw" checked={form.manual} onChange={() => setForm({ ...form, manual: true })} />
              خودم وارد می‌کنم
            </label>
            {form.manual && (
              <label className="f">
                <span>رمز موقت (حداقل ۱۲ نویسه)</span>
                <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={form.must_change_password} onChange={(e) => setForm({ ...form, must_change_password: e.target.checked })} />
              در اولین ورود رمز خودش را بگذارد (پیشنهادی)
            </label>
          </fieldset>
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

      {issued && <TempPassword email={issued.email} password={issued.password} onDone={() => setIssued(null)} />}
      {roleEdit && cat.data && (
        <RoleEditor
          role={roleEdit}
          cat={cat.data}
          readOnly={!!roleEdit.builtin || !can(me, "roles.manage")}
          onClose={() => setRoleEdit(null)}
          onSaved={() => {
            setRoleEdit(null);
            roles.reload();
          }}
        />
      )}
    </>
  );
}

function Stat({ k, v, tone }: { k: string; v: number; tone?: "warn" | "bad" }) {
  return (
    <div className="card stat" data-tone={tone}>
      <div className="k">{k}</div>
      <div className="v">{num(v)}</div>
    </div>
  );
}
