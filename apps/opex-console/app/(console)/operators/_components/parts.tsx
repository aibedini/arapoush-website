"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { can, useAction, useMe } from "@/lib/hooks";
import { ROLE } from "@/lib/fa";
import { Dialog, ErrorNote } from "@/components/ui";

export type Op = {
  id: string;
  email: string | null;
  display_name: string;
  title: string | null;
  role: string;
  status: string;
  last_login_at: string | null;
  locked_until: string | null;
  created_at: string;
  mfa: boolean;
  must_change_password: boolean;
  access_expires_at: string | null;
  active_sessions: number;
  perm_allow: string[];
  perm_deny: string[];
};
export type Perm = { key: string; group: string; label: { en: string; fa: string }; danger?: boolean };
export type Catalogue = { permissions: Perm[]; builtin: { key: string; name: { en: string; fa: string }; permissions: string[] }[] };
export type Role = { key: string; name: string; description: string; permissions: string[]; builtin: boolean; members: number };

export const GROUPS: Record<string, string> = {
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

export const roleLabel = (k: string, roles?: Role[] | null) => ROLE[k] ?? roles?.find((r) => r.key === k)?.name ?? k;
export const isLocked = (o: { locked_until: string | null }) => !!o.locked_until && new Date(o.locked_until).getTime() > Date.now();
export const isExpired = (o: { access_expires_at: string | null }) => !!o.access_expires_at && new Date(o.access_expires_at).getTime() <= Date.now();
/** `<input type="date">` value ↔ the end of that day in local time, as ISO. */
export const dayEnd = (v: string) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);
export const toDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const tomorrow = () => toDay(new Date(Date.now() + 86_400_000).toISOString());

/** Status at a glance; text, not colour alone. */
export function StatusBadges({ o }: { o: Pick<Op, "status" | "locked_until" | "mfa" | "must_change_password" | "access_expires_at"> }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {o.status === "active" ? <span className="badge ok">فعال</span> : <span className="badge bad">غیرفعال</span>}
      {isLocked(o) && <span className="badge bad">قفل</span>}
      {isExpired(o) && <span className="badge bad">دسترسی تمام‌شده</span>}
      {!o.mfa && <span className="badge warn">بدون دومرحله‌ای</span>}
      {o.must_change_password && <span className="badge warn">رمز موقت</span>}
    </div>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

/** Shown once after OPEX generates a password: the server keeps only its hash. */
export function TempPassword({ email, password, onDone }: { email: string | null; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <Dialog open onClose={onDone} title="رمز موقت">
      <div className="stack">
        <div className="note warn" role="status">
          این رمز فقط همین یک بار نمایش داده می‌شود و جایی ذخیره نمی‌شود. آن را از راهی امن (نه ایمیل یا پیام‌رسان عمومی) به کاربر بدهید.
        </div>
        {email && (
          <div className="small">
            ایمیل ورود: <code dir="ltr">{email}</code>
          </div>
        )}
        <div className="secret" aria-label="رمز موقت">
          {password}
        </div>
        <p className="small muted">در اولین ورود، کاربر احراز دومرحله‌ای را فعال می‌کند و رمز خودش را می‌گذارد. تا آن موقع به هیچ بخش دیگری دسترسی ندارد.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={copy}>
            {copied ? "کپی شد" : "کپی رمز"}
          </button>
          <button type="button" className="btn" onClick={onDone}>
            رمز را برداشتم، بستن
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function grouped(cat: Catalogue) {
  const g: Record<string, Perm[]> = {};
  for (const p of cat.permissions) (g[p.group] ??= []).push(p);
  return Object.entries(g);
}

/** Per permission: from the role, allowed for this user, or denied for this user. */
export function UserPermissions({ op, cat, rolePerms, roleName, onClose, onSaved }: { op: Pick<Op, "id" | "display_name" | "perm_allow" | "perm_deny">; cat: Catalogue; rolePerms: string[]; roleName: string; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const act = useAction();
  const [allow, setAllow] = useState(new Set(op.perm_allow ?? []));
  const [deny, setDeny] = useState(new Set(op.perm_deny ?? []));
  const [q, setQ] = useState("");
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
  const match = (p: Perm) => !q || p.label.fa.includes(q) || p.key.includes(q.toLowerCase());
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
          <span className="small muted">
            {allow.size} اجازهٔ اختصاصی · {deny.size} منع اختصاصی
          </span>
        </div>
      }
    >
      <p className="small muted">
        نقش: {roleName} · {effective} از {cat.permissions.length} دسترسی فعال. «از نقش» یعنی همان چیزی که نقش می‌دهد؛ «اجازه» و «منع» فقط برای همین کاربر است. نمی‌توانید دسترسی‌ای را بدهید که خودتان ندارید.
      </p>
      <label className="f">
        <span>جست‌وجوی دسترسی</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً انتشار یا content" />
      </label>
      <ErrorNote error={act.error} />
      <div className="stack">
        {grouped(cat).map(([group, all]) => {
          const perms = all.filter(match);
          if (!perms.length) return null;
          return (
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
          );
        })}
      </div>
    </Dialog>
  );
}

export function RoleEditor({ role, cat, readOnly, onClose, onSaved }: { role: Partial<Role>; cat: Catalogue; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
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
  const toggleGroup = (perms: Perm[], on: boolean) => {
    const s = new Set(f.permissions);
    for (const p of perms) {
      if (!can(me, p.key)) continue;
      if (on) s.add(p.key);
      else s.delete(p.key);
    }
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
        <p className="small muted">{f.permissions.size} دسترسی انتخاب شده. فقط دسترسی‌هایی را می‌توانید در نقش بگذارید که خودتان دارید.</p>
        {grouped(cat).map(([group, perms]) => (
          <fieldset key={group} className="card" style={{ padding: 12 }}>
            <legend style={{ fontWeight: 700 }}>{GROUPS[group] ?? group}</legend>
            {!readOnly && (
              <div className="row" style={{ marginBlockEnd: 6 }}>
                <button type="button" className="btn sm ghost" onClick={() => toggleGroup(perms, true)}>
                  همه
                </button>
                <button type="button" className="btn sm ghost" onClick={() => toggleGroup(perms, false)}>
                  هیچ‌کدام
                </button>
              </div>
            )}
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
