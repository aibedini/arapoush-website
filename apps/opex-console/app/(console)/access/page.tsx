"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { LOCALE_LABEL, when } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Grant = { id: string; subject_kind: string; subject_id: string; scope: { types: string[]; fields?: string[]; exclude?: string[]; locales?: string[] }; actions: string[]; expires_at: string | null; created_at: string };
type Type = { key: string; label: string };

const ACTIONS: Record<string, string> = {
  read: "خواندن",
  propose: "پیشنهاد تغییر",
  "media.upload": "بارگذاری رسانه",
  "cr.withdraw": "پس گرفتن درخواست",
  "cr.read_all": "دیدن درخواست‌های همکاران",
  "entry.create": "افزودن مورد به فهرست‌ها",
  "entry.delete": "حذف مورد از فهرست‌ها",
};
const SUBJECT: Record<string, string> = { partner_role: "نقش", partner_user: "کاربر", partner_client: "کل کلاینت" };
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const blank = { subject_kind: "partner_role", subject_id: "aracms_editor", types: [] as string[], fields: "/**", exclude: "", locales: ["fa", "en", "tr"], actions: ["read", "propose"], expires: "" };

/**
 * Who in AraCMS may read or propose what (plan §4.3). Deny by default; exclusions win; locked and
 * operator-only fields can never be granted, whatever is entered here.
 */
export default function Access() {
  const me = useMe();
  const admin = me?.role === "super_admin";
  const list = useApi<Grant[]>("/v1/manage/grants");
  const types = useApi<Type[]>("/v1/manage/types");
  const act = useAction();
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      await api("/v1/manage/grants", {
        body: {
          subject_kind: form.subject_kind,
          subject_id: form.subject_id.trim(),
          scope: { types: form.types, fields: lines(form.fields), ...(lines(form.exclude).length ? { exclude: lines(form.exclude) } : {}), locales: form.locales },
          actions: form.actions,
          expires_at: form.expires ? new Date(form.expires).toISOString() : null,
        },
      });
      setOpen(false);
      setForm(blank);
      list.reload();
    }, "دسترسی ساخته شد.");
  };
  const remove = (g: Grant) => confirm("این دسترسی حذف شود؟ اثرش فوری است.") && act.run(async () => (await api(`/v1/manage/grants/${g.id}`, { method: "DELETE" }), list.reload()), "دسترسی حذف شد.");
  const toggle = <K extends "types" | "locales" | "actions">(k: K, v: string) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  return (
    <>
      <PageHead title="دسترسی‌های آراسی‌ام‌اس" sub="چه کسی در آراسی‌ام‌اس کدام محتوا، فیلد و زبان را می‌بیند یا پیشنهاد تغییر می‌دهد.">
        {admin && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            دسترسی تازه
          </button>
        )}
      </PageHead>
      <div className="grid">
        <div className="note small">بدون دسترسی، چیزی دیده نمی‌شود. فیلدهای قفل (هندسهٔ سه‌بعدی، شناسه‌ها، رندرها) و فیلدهای «فقط اپراتور» هرگز به شریک داده نمی‌شوند.</div>
        <ErrorNote error={act.error ?? list.error} />
        {act.done && <div className="note ok" role="status">{act.done}</div>}
        <section className="card" aria-label="دسترسی‌ها">
          {!list.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : !list.data.length ? (
            <div className="empty">هنوز دسترسی‌ای تعریف نشده؛ آراسی‌ام‌اس فعلاً هیچ محتوایی نمی‌بیند.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>برای</th>
                    <th>محتوا</th>
                    <th>فیلدها</th>
                    <th>زبان‌ها</th>
                    <th>کارها</th>
                    <th>انقضا</th>
                    {admin && <th><span className="sr-only">حذف</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <span className="badge">{SUBJECT[g.subject_kind]}</span> <code>{g.subject_id}</code>
                      </td>
                      <td className="small">{g.scope.types.map((t) => <code key={t} style={{ display: "block" }}>{t}</code>)}</td>
                      <td className="small">
                        {(g.scope.fields ?? ["/**"]).map((f) => <code key={f} style={{ display: "block" }}>{f}</code>)}
                        {(g.scope.exclude ?? []).map((f) => <code key={f} className="diff-old" style={{ display: "block" }}>{f}</code>)}
                      </td>
                      <td className="small">{(g.scope.locales ?? ["fa", "en", "tr"]).map((l) => LOCALE_LABEL[l]).join("، ")}</td>
                      <td>
                        <div className="row">
                          {g.actions.map((a) => (
                            <span key={a} className="badge accent">{ACTIONS[a] ?? a}</span>
                          ))}
                        </div>
                      </td>
                      <td className="small muted">{g.expires_at ? when(g.expires_at) : "—"}</td>
                      {admin && (
                        <td>
                          <button type="button" className="btn sm danger" onClick={() => remove(g)}>
                            حذف
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="دسترسی تازه" wide>
        <form className="stack" onSubmit={save}>
          <div className="filters">
            <label className="f">
              <span>برای</span>
              <select value={form.subject_kind} onChange={(e) => setForm({ ...form, subject_kind: e.target.value })}>
                {Object.entries(SUBJECT).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="f">
              <span>{form.subject_kind === "partner_role" ? "نام نقش (مثل aracms_editor)" : form.subject_kind === "partner_user" ? "شناسهٔ کاربر (prn_…)" : "شناسهٔ شریک (pcl_…)"}</span>
              <input dir="ltr" required value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} />
            </label>
            <label className="f">
              <span>انقضا (اختیاری)</span>
              <input type="datetime-local" dir="ltr" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
            </label>
          </div>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">محتوا</legend>
            <div className="row">
              {types.data?.map((t) => (
                <label key={t.key} className="check small" title={t.label}>
                  <input type="checkbox" checked={form.types.includes(t.key)} onChange={() => toggle("types", t.key)} />
                  <code>{t.key}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="filters">
            <label className="f">
              <span>فیلدها (الگو، هر خط یکی؛ /** یعنی همه)</span>
              <textarea dir="ltr" rows={3} value={form.fields} onChange={(e) => setForm({ ...form, fields: e.target.value })} />
            </label>
            <label className="f">
              <span>به‌جز (اولویت دارد)</span>
              <textarea dir="ltr" rows={3} value={form.exclude} onChange={(e) => setForm({ ...form, exclude: e.target.value })} placeholder="/meta/**" />
            </label>
          </div>
          <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">زبان‌ها</legend>
            {(["fa", "en", "tr"] as const).map((l) => (
              <label key={l} className="check">
                <input type="checkbox" checked={form.locales.includes(l)} onChange={() => toggle("locales", l)} />
                {LOCALE_LABEL[l]}
              </label>
            ))}
          </fieldset>
          <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">کارهای مجاز</legend>
            {Object.entries(ACTIONS).map(([k, v]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={form.actions.includes(k)} onChange={() => toggle("actions", k)} />
                {v}
              </label>
            ))}
          </fieldset>
          <ErrorNote error={act.error} />
          <div className="row">
            <button className="btn primary" disabled={act.busy || !form.types.length || !form.actions.length || !form.locales.length}>
              ساختن
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              انصراف
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
