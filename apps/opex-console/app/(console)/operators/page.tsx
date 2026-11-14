"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, ROLE } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Op = { id: string; email: string; display_name: string; role: string; status: string; last_login_at: string | null; locked_until: string | null; mfa: boolean; perm_allow: string[]; perm_deny: string[] };
type Perm = { key: string; group: string; label: { en: string; fa: string }; danger?: boolean };
type Catalogue = { permissions: Perm[]; builtin: { key: string; name: { en: string; fa: string }; permissions: string[] }[] };
type Role = { key: string; name: string; description: string; permissions: string[]; builtin: boolean; members: number };

const GROUPS: Record<string, string> = {
  dashboard: "داشبورد",
  content: "محتوا و صفحه‌ساز",
  media: "رسانه",
  catalogue: "کاتالوگ و رندر",
  forms: "فرم‌ها",
  helpdesk: "پشتیبانی (تیکت‌ها)",
  requests: "درخواست‌های تغییر",
  partners: "شرکا و وب‌هوک‌ها",
  audit: "ممیزی و مستندات",
  users: "کاربران و نقش‌ها",
  settings: "تنظیمات سایت",
  seo: "سئو",
  backup: "پشتیبان‌گیری",
};

/** S1: users, roles and per-user permissions for every console function. */
export default function Operators() {
  const me = useMe();
  const [tab, setTab] = useState<"users" | "roles">("users");
  const list = useApi<Op[]>("/v1/manage/operators");
  const roles = useApi<Role[]>(can(me, "roles.read") ? "/v1/manage/roles" : null);
  const cat = useApi<Catalogue>("/v1/manage/permissions");
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Op | null>(null);
  const [resetting, setResetting] = useState<Op | null>(null);
  const [resetPw, setResetPw] = useState({ password: "", again: "", totp: "" });
  const [roleEdit, setRoleEdit] = useState<Partial<Role> | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", role: "operator", password: "" });
  const roleKeys = roles.data?.map((r) => r.key) ?? ["super_admin", "operator", "auditor", "viewer"];
  const roleName = (k: string) => ROLE[k] ?? roles.data?.find((r) => r.key === k)?.name ?? k;

  const patch = (o: Op, body: Record<string, unknown>, ok: string) =>
    act.run(async () => {
      await api(`/v1/manage/operators/${o.id}`, { method: "PATCH", body });
      list.reload();
      roles.reload();
    }, ok);
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      await api("/v1/manage/operators", { body: form });
      setAdding(false);
      setForm({ email: "", display_name: "", role: "operator", password: "" });
      list.reload();
    }, "کاربر ساخته شد. در اولین ورود، احراز دومرحله‌ای را فعال می‌کند.");
  };

  return (
    <>
      <PageHead title="کاربران و دسترسی‌ها" sub="هر کار کنسول یک دسترسی دارد. نقش مجموعه‌ای از دسترسی‌هاست و برای هر کاربر می‌توان دسترسی جدا داد یا گرفت. تغییرها به تأیید دوبارهٔ هویت نیاز دارند.">
        {can(me, "users.create") && tab === "users" && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            کاربر تازه
          </button>
        )}
        {can(me, "roles.manage") && tab === "roles" && (
          <button type="button" className="btn primary" onClick={() => setRoleEdit({ key: "", name: "", description: "", permissions: [] })}>
            نقش تازه
          </button>
        )}
      </PageHead>
      <div className="row" role="tablist" aria-label="بخش‌ها" style={{ marginBlockEnd: 12 }}>
        <button type="button" role="tab" aria-selected={tab === "users"} className={`btn sm${tab === "users" ? " primary" : ""}`} onClick={() => setTab("users")}>
          کاربران
        </button>
        {can(me, "roles.read") && (
          <button type="button" role="tab" aria-selected={tab === "roles"} className={`btn sm${tab === "roles" ? " primary" : ""}`} onClick={() => setTab("roles")}>
            نقش‌ها
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
          <section className="card" aria-label="فهرست کاربران">
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
                      <th>کارها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((o) => {
                      const locked = o.locked_until && new Date(o.locked_until).getTime() > Date.now();
                      const self = o.id === me?.id;
                      const own = (o.perm_allow?.length ?? 0) + (o.perm_deny?.length ?? 0);
                      return (
                        <tr key={o.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {o.display_name} {self && <span className="badge">شما</span>}
                            </div>
                            <code className="small muted">{o.email}</code>
                          </td>
                          <td>
                            {can(me, "users.permissions") && !self ? (
                              <select aria-label={`نقش ${o.display_name}`} value={o.role} onChange={(e) => patch(o, { role: e.target.value }, "نقش تغییر کرد.")} style={{ maxInlineSize: 180 }}>
                                {roleKeys.map((r) => (
                                  <option key={r} value={r}>
                                    {roleName(r)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              roleName(o.role)
                            )}
                            {own > 0 && <div className="small muted">{own} دسترسی اختصاصی</div>}
                          </td>
                          <td>
                            <div className="row">
                              {o.status === "active" ? <span className="badge ok">فعال</span> : <span className="badge bad">غیرفعال</span>}
                              {locked && <span className="badge bad">قفل</span>}
                              {o.mfa ? <span className="badge">دومرحله‌ای</span> : <span className="badge warn">بدون دومرحله‌ای</span>}
                            </div>
                          </td>
                          <td className="small muted">{ago(o.last_login_at)}</td>
                          <td>
                            <div className="row">
                              {can(me, "users.permissions") && !self && (
                                <button type="button" className="btn sm" onClick={() => setEditing(o)}>
                                  دسترسی‌ها
                                </button>
                              )}
                              {can(me, "users.update") && !self && (
                                <button type="button" className={`btn sm${o.status === "active" ? " danger" : ""}`} onClick={() => patch(o, { status: o.status === "active" ? "disabled" : "active" }, "وضعیت تغییر کرد.")}>
                                  {o.status === "active" ? "غیرفعال کردن" : "فعال کردن"}
                                </button>
                              )}
                              {can(me, "users.update") && locked && (
                                <button type="button" className="btn sm" onClick={() => patch(o, { unlock: true }, "قفل حساب باز شد.")}>
                                  باز کردن قفل
                                </button>
                              )}
                              {can(me, "users.update") && o.mfa && !self && (
                                <button type="button" className="btn sm" onClick={() => confirm(`احراز دومرحله‌ای ${o.display_name} بازنشانی شود؟`) && patch(o, { reset_mfa: true }, "احراز دومرحله‌ای بازنشانی شد.")}>
                                  بازنشانی دومرحله‌ای
                                </button>
                              )}
                              {can(me, "users.update") && !self && (
                                <button type="button" className="btn sm warn" onClick={() => { setResetting(o); setResetPw({ password: "", again: "", totp: "" }); }}>
                                  ریست رمز
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
                          <div style={{ fontWeight: 600 }}>{roleName(r.key)}</div>
                          <code className="small muted">{r.key}</code> {r.builtin && <span className="badge">پیش‌فرض</span>}
                        </td>
                        <td className="small">{r.key === "super_admin" ? "همه" : r.permissions.length}</td>
                        <td>{r.members}</td>
                        <td>
                          <div className="row">
                            <button type="button" className="btn sm" onClick={() => setRoleEdit(r)} disabled={r.builtin && r.key === "super_admin"}>
                              {r.builtin || !can(me, "roles.manage") ? "دیدن" : "ویرایش"}
                            </button>
                            {!r.builtin && can(me, "roles.manage") && (
                              <button
                                type="button"
                                className="btn sm danger"
                                disabled={r.members > 0}
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
              {roleKeys.map((r) => (
                <option key={r} value={r}>
                  {roleName(r)}
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

      {resetting && (
        <Dialog open onClose={() => setResetting(null)} title={`ریست رمز: ${resetting.display_name}`}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (resetPw.password !== resetPw.again) return act.setError(new ApiError(0, "MISMATCH", "تکرار رمز یکسان نیست."));
              act.run(async () => {
                await api("/v1/manage/auth/step-up", { body: { code: resetPw.totp } });
                await api(`/v1/manage/operators/${resetting.id}/reset-password`, { body: { password: resetPw.password } });
                setResetting(null);
                list.reload();
              }, `رمز ${resetting.display_name} بازنشانی شد. نشست‌هایش پایان یافت.`);
            }}
          >
            <label className="f">
              <span>رمز تازه (حداقل ۱۲ نویسه)</span>
              <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} value={resetPw.password} onChange={(e) => setResetPw({ ...resetPw, password: e.target.value })} />
            </label>
            <label className="f">
              <span>تکرار رمز تازه</span>
              <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} value={resetPw.again} onChange={(e) => setResetPw({ ...resetPw, again: e.target.value })} />
            </label>
            <label className="f">
              <span>کد احراز هویت (Google Authenticator)</span>
              <input type="text" dir="ltr" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required placeholder="۶ رقم" value={resetPw.totp} onChange={(e) => setResetPw({ ...resetPw, totp: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
            </label>
            <ErrorNote error={act.error} />
            <div className="row">
              <button className="btn primary" disabled={act.busy}>بازنشانی</button>
              <button type="button" className="btn" onClick={() => setResetting(null)}>انصراف</button>
            </div>
          </form>
        </Dialog>
      )}

      {editing && cat.data && (
        <UserPermissions
          op={editing}
          cat={cat.data}
          rolePerms={editing.role === "super_admin" ? cat.data.permissions.map((p) => p.key) : (roles.data?.find((r) => r.key === editing.role)?.permissions ?? cat.data.builtin.find((b) => b.key === editing.role)?.permissions ?? [])}
          roleLabel={roleName(editing.role)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
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

function grouped(cat: Catalogue) {
  const g: Record<string, Perm[]> = {};
  for (const p of cat.permissions) (g[p.group] ??= []).push(p);
  return Object.entries(g);
}

/** Per permission: from the role, allowed for this user, or denied for this user. */
function UserPermissions({ op, cat, rolePerms, roleLabel, onClose, onSaved }: { op: Op; cat: Catalogue; rolePerms: string[]; roleLabel: string; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const act = useAction();
  const [allow, setAllow] = useState(new Set(op.perm_allow ?? []));
  const [deny, setDeny] = useState(new Set(op.perm_deny ?? []));
  const role = useMemo(() => new Set(rolePerms), [rolePerms]);
  const state = (k: string) => (allow.has(k) ? "allow" : deny.has(k) ? "deny" : "role");
  const set = (k: string, v: "role" | "allow" | "deny") => {
    const a = new Set(allow);
    const d = new Set(deny);
    a.delete(k);
    d.delete(k);
    if (v === "allow") a.add(k);
    if (v === "deny") d.add(k);
    setAllow(a);
    setDeny(d);
  };
  const effective = cat.permissions.filter((p) => (role.has(p.key) || allow.has(p.key)) && !deny.has(p.key)).length;
  const save = () =>
    act.run(async () => {
      await api(`/v1/manage/operators/${op.id}/permissions`, { method: "PUT", body: { allow: [...allow], deny: [...deny] } });
      onSaved();
    });
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`دسترسی‌های ${op.display_name}`}
      footer={
        <div className="row">
          <button type="button" className="btn primary" disabled={act.busy} onClick={save}>
            ذخیره
          </button>
          <button type="button" className="btn" onClick={onClose}>
            انصراف
          </button>
        </div>
      }
    >
      <p className="small muted">
        نقش: {roleLabel} · {effective} از {cat.permissions.length} دسترسی فعال. «از نقش» یعنی همان چیزی که نقش می‌دهد؛ «اجازه» و «منع» فقط برای همین کاربر است. نمی‌توانید دسترسی‌ای را بدهید که خودتان ندارید.
      </p>
      <ErrorNote error={act.error} />
      <div className="stack">
        {grouped(cat).map(([group, perms]) => (
          <fieldset key={group} className="card" style={{ padding: 12 }}>
            <legend style={{ fontWeight: 700 }}>{GROUPS[group] ?? group}</legend>
            <div className="table-wrap">
              <table>
                <tbody>
                  {perms.map((p) => {
                    const on = (role.has(p.key) || allow.has(p.key)) && !deny.has(p.key);
                    return (
                      <tr key={p.key}>
                        <td>
                          <div>
                            {p.label.fa} {p.danger && <span className="badge warn">حساس</span>}
                          </div>
                          <code className="small muted">{p.key}</code>
                        </td>
                        <td className="small">{on ? <span className="badge ok">دارد</span> : <span className="badge">ندارد</span>}</td>
                        <td>
                          <select aria-label={`${p.label.fa} برای ${op.display_name}`} value={state(p.key)} onChange={(e) => set(p.key, e.target.value as "role")} style={{ maxInlineSize: 150 }}>
                            <option value="role">از نقش ({role.has(p.key) ? "دارد" : "ندارد"})</option>
                            <option value="allow" disabled={!can(me, p.key)}>
                              اجازه
                            </option>
                            <option value="deny">منع</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        ))}
      </div>
    </Dialog>
  );
}

function RoleEditor({ role, cat, readOnly, onClose, onSaved }: { role: Partial<Role>; cat: Catalogue; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const act = useAction();
  const isNew = !role.key;
  const [f, setF] = useState({ key: role.key ?? "", name: role.name ?? "", description: role.description ?? "", permissions: new Set(role.permissions ?? []) });
  const toggle = (k: string) => {
    const s = new Set(f.permissions);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setF({ ...f, permissions: s });
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      const body = { name: f.name, description: f.description, permissions: [...f.permissions] };
      if (isNew) await api("/v1/manage/roles", { body: { key: f.key, ...body } });
      else await api(`/v1/manage/roles/${role.key}`, { method: "PUT", body });
      onSaved();
    });
  };
  return (
    <Dialog open wide onClose={onClose} title={isNew ? "نقش تازه" : `نقش ${role.name ?? role.key}`}>
      <form className="stack" onSubmit={save}>
        {isNew && (
          <label className="f">
            <span>کلید (انگلیسی، مثل seo_editor)</span>
            <input dir="ltr" required pattern="[a-z][a-z0-9_]{1,39}" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
          </label>
        )}
        <label className="f">
          <span>نام</span>
          <input required minLength={2} disabled={readOnly} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="f">
          <span>توضیح</span>
          <input disabled={readOnly} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        {grouped(cat).map(([group, perms]) => (
          <fieldset key={group} className="card" style={{ padding: 12 }}>
            <legend style={{ fontWeight: 700 }}>{GROUPS[group] ?? group}</legend>
            <div className="stack">
              {perms.map((p) => (
                <label key={p.key} className="row" style={{ gap: 8, minBlockSize: 28 }}>
                  <input type="checkbox" checked={f.permissions.has(p.key)} disabled={readOnly || !can(me, p.key)} onChange={() => toggle(p.key)} />
                  <span>
                    {p.label.fa} {p.danger && <span className="badge warn">حساس</span>} <code className="small muted">{p.key}</code>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <ErrorNote error={act.error} />
        {!readOnly && (
          <div className="row">
            <button className="btn primary" disabled={act.busy}>
              ذخیره
            </button>
            <button type="button" className="btn" onClick={onClose}>
              انصراف
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
