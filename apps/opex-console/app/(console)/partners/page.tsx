"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { ago, num, when } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Partner = { id: string; client_id: string; name: string; status: string; allowed_cidrs: string[]; mtls_fingerprint: string | null; redirect_uris: string[]; scopes: string[]; contact: string | null; created_at: string; keys: number; users: number; webhook_url: string | null };
type PUser = { id: string; email: string; display_name: string; role: string; status: string; last_login_at: string | null; locked_until: string | null; mfa: boolean };

const SCOPES: Record<string, string> = {
  "content:read": "خواندن محتوا",
  "content:propose": "پیشنهاد تغییر محتوا",
  "media:upload": "بارگذاری رسانه",
  "cr:read": "دیدن درخواست‌های تغییر",
  "cr:withdraw": "پس گرفتن درخواست تغییر",
};
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const empty = { name: "", cidrs: "", redirects: "", jwks: "", contact: "", mtls: "", scopes: ["content:read", "content:propose", "media:upload", "cr:read", "cr:withdraw"] };

function Users({ partner, admin }: { partner: Partner; admin: boolean }) {
  const list = useApi<PUser[]>(`/v1/manage/partners/${partner.id}/users`);
  const act = useAction();
  const [f, setF] = useState({ email: "", display_name: "", role: "editor", password: "" });
  const patch = (u: PUser, body: Record<string, unknown>, ok: string) =>
    act.run(async () => {
      await api(`/v1/manage/partner-users/${u.id}`, { method: "PATCH", body });
      list.reload();
    }, ok);
  return (
    <div className="stack">
      <ErrorNote error={act.error ?? list.error} />
      {act.done && <div className="note ok">{act.done}</div>}
      {!list.data ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <div className="empty">هنوز کاربری برای این شریک ساخته نشده است.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>نقش</th>
                <th>وضعیت</th>
                <th>آخرین ورود</th>
                {admin && <th>کارها</th>}
              </tr>
            </thead>
            <tbody>
              {list.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.display_name}
                    <div>
                      <code className="small muted">{u.email}</code>
                    </div>
                  </td>
                  <td>
                    <code>{u.role}</code>
                  </td>
                  <td>
                    <div className="row">
                      {u.status === "active" ? <span className="badge ok">فعال</span> : <span className="badge bad">غیرفعال</span>}
                      {u.mfa ? <span className="badge">دومرحله‌ای</span> : <span className="badge warn">بدون دومرحله‌ای</span>}
                    </div>
                  </td>
                  <td className="small muted">{ago(u.last_login_at)}</td>
                  {admin && (
                    <td>
                      <div className="row">
                        <button type="button" className={`btn sm${u.status === "active" ? " danger" : ""}`} onClick={() => patch(u, { status: u.status === "active" ? "disabled" : "active" }, "وضعیت تغییر کرد.")}>
                          {u.status === "active" ? "غیرفعال کردن" : "فعال کردن"}
                        </button>
                        {u.locked_until && (
                          <button type="button" className="btn sm" onClick={() => patch(u, { unlock: true }, "قفل باز شد.")}>
                            باز کردن قفل
                          </button>
                        )}
                        {u.mfa && (
                          <button type="button" className="btn sm" onClick={() => patch(u, { reset_mfa: true }, "احراز دومرحله‌ای بازنشانی شد.")}>
                            بازنشانی دومرحله‌ای
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {admin && (
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            act.run(async () => {
              await api(`/v1/manage/partners/${partner.id}/users`, { body: f });
              setF({ email: "", display_name: "", role: "editor", password: "" });
              list.reload();
            }, "کاربر ساخته شد.");
          }}
        >
          <label className="f">
            <span>نام</span>
            <input required minLength={2} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
          </label>
          <label className="f">
            <span>ایمیل</span>
            <input type="email" dir="ltr" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </label>
          <label className="f">
            <span>نقش (در آراسی‌ام‌اس)</span>
            <input dir="ltr" pattern="[a-z0-9_]{2,40}" required value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          </label>
          <label className="f">
            <span>رمز موقت</span>
            <input type="password" dir="ltr" autoComplete="new-password" minLength={12} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </label>
          <button className="btn" disabled={act.busy}>
            افزودن کاربر
          </button>
        </form>
      )}
    </div>
  );
}

export default function Partners() {
  const me = useMe();
  const admin = me?.role === "super_admin";
  const list = useApi<Partner[]>("/v1/manage/partners");
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);
  const [created, setCreated] = useState<string | null>(null);
  const [usersOf, setUsersOf] = useState<Partner | null>(null);
  const [rotate, setRotate] = useState<Partner | null>(null);
  const [hook, setHook] = useState<Partner | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [hookSecret, setHookSecret] = useState<string | null>(null);
  const saveHook = (url: string | null) =>
    act.run(async () => {
      const r = await api<{ secret: string | null }>(`/v1/manage/partners/${hook!.id}/webhook`, { method: "PUT", body: { url } });
      setHookSecret(r.secret);
      list.reload();
    }, url ? "نشانی وب‌هوک ذخیره شد." : "وب‌هوک خاموش شد.");
  const [jwks, setJwks] = useState("");

  const parseJwks = (s: string) => {
    try {
      const j = JSON.parse(s);
      return j.keys ? j : { keys: Array.isArray(j) ? j : [j] };
    } catch {
      throw new ApiError(0, "JWKS", "کلید عمومی باید JSON معتبر (JWK یا JWKS) باشد.");
    }
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      const r = await api<{ client_id: string }>("/v1/manage/partners", {
        body: { name: form.name, allowed_cidrs: lines(form.cidrs), redirect_uris: lines(form.redirects), jwks: parseJwks(form.jwks), scopes: form.scopes, ...(form.contact ? { contact: form.contact } : {}), ...(form.mtls ? { mtls_fingerprint: form.mtls } : {}) },
      });
      setCreated(r.client_id);
      setAdding(false);
      setForm(empty);
      list.reload();
    });
  };
  const patch = (p: Partner, body: Record<string, unknown>, ok: string) =>
    act.run(async () => {
      await api(`/v1/manage/partners/${p.id}`, { method: "PATCH", body });
      list.reload();
    }, ok);

  return (
    <>
      <PageHead title="شرکا (آراسی‌ام‌اس)" sub="سامانه‌هایی که فقط از راه API به OPEX وصل می‌شوند؛ هر تغییرشان یک درخواست تغییر است.">
        {admin && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            شریک تازه
          </button>
        )}
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error} />
        {act.done && <div className="note ok">{act.done}</div>}
        {created && (
          <div className="note ok" role="status">
            شریک ساخته شد. شناسهٔ کلاینت را به تیم آراسی‌ام‌اس بدهید: <code>{created}</code>
          </div>
        )}
        {!list.data ? (
          <Loading />
        ) : list.data.length === 0 ? (
          <div className="card empty">هنوز شریکی تعریف نشده است.</div>
        ) : (
          list.data.map((p) => (
            <section key={p.id} className="card" aria-label={p.name}>
              <div className="card-head">
                <div>
                  <h2>
                    {p.name} {p.status === "active" ? <span className="badge ok">فعال</span> : <span className="badge bad">غیرفعال</span>}
                  </h2>
                  <code className="small muted">{p.client_id}</code>
                </div>
                <div className="row">
                  <button type="button" className="btn sm" onClick={() => setUsersOf(p)}>
                    کاربران ({num(p.users)})
                  </button>
                  {admin && (
                    <>
                      <button type="button" className="btn sm" onClick={() => (setHook(p), setHookUrl(p.webhook_url ?? ""), setHookSecret(null))}>
                        وب‌هوک{p.webhook_url ? "" : " (خاموش)"}
                      </button>
                      <button type="button" className="btn sm" onClick={() => (setJwks(""), setRotate(p))}>
                        چرخش کلید
                      </button>
                      <button type="button" className={`btn sm${p.status === "active" ? " danger" : ""}`} onClick={() => confirm(p.status === "active" ? `دسترسی ${p.name} قطع شود؟ همهٔ نشست‌هایش پایان می‌یابد.` : `${p.name} فعال شود؟`) && patch(p, { status: p.status === "active" ? "disabled" : "active" }, "وضعیت شریک تغییر کرد.")}>
                        {p.status === "active" ? "قطع دسترسی" : "فعال کردن"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="card-body filters" style={{ alignItems: "start" }}>
                <div>
                  <div className="small muted">دسترسی‌ها</div>
                  <div className="row">
                    {p.scopes.map((s) => (
                      <span key={s} className="badge accent" title={s}>
                        {SCOPES[s] ?? s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="small muted">شبکه‌های مجاز</div>
                  {p.allowed_cidrs.length ? p.allowed_cidrs.map((c) => <div key={c}><code>{c}</code></div>) : <span className="badge warn">همه (محدود نشده)</span>}
                </div>
                <div>
                  <div className="small muted">mTLS</div>
                  {p.mtls_fingerprint ? <code className="small" style={{ wordBreak: "break-all" }}>{p.mtls_fingerprint}</code> : <span className="muted">—</span>}
                </div>
                <div>
                  <div className="small muted">کلیدها / ساخته‌شده</div>
                  <div className="small">
                    {num(p.keys)} کلید · {when(p.created_at)}
                  </div>
                  {p.contact && <div className="small">{p.contact}</div>}
                </div>
              </div>
            </section>
          ))
        )}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="شریک تازه" wide>
        <form className="stack" onSubmit={create}>
          <label className="f">
            <span>نام</span>
            <input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="AraCMS" />
          </label>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted" style={{ marginBlockEnd: 6 }}>
              دسترسی‌ها
            </legend>
            {Object.entries(SCOPES).map(([k, l]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={form.scopes.includes(k)} onChange={(e) => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, k] : form.scopes.filter((x) => x !== k) })} />
                {l} <code className="small muted">{k}</code>
              </label>
            ))}
          </fieldset>
          <label className="f">
            <span>شبکه‌های مجاز (CIDR، هر خط یکی)</span>
            <textarea dir="ltr" rows={2} value={form.cidrs} onChange={(e) => setForm({ ...form, cidrs: e.target.value })} placeholder="203.0.113.10/32" />
          </label>
          <label className="f">
            <span>نشانی‌های بازگشت OAuth (هر خط یکی، فقط https)</span>
            <textarea dir="ltr" rows={2} value={form.redirects} onChange={(e) => setForm({ ...form, redirects: e.target.value })} placeholder="https://cms.example.com/opex/callback" />
          </label>
          <label className="f">
            <span>کلید عمومی آراسی‌ام‌اس (JWK یا JWKS؛ فقط کلید عمومی)</span>
            <textarea dir="ltr" rows={5} required value={form.jwks} onChange={(e) => setForm({ ...form, jwks: e.target.value })} placeholder='{"keys":[{"kty":"EC","crv":"P-256","x":"…","y":"…","kid":"aracms-1"}]}' />
          </label>
          <label className="f">
            <span>اثر انگشت گواهی mTLS (اختیاری)</span>
            <input dir="ltr" value={form.mtls} onChange={(e) => setForm({ ...form, mtls: e.target.value })} />
          </label>
          <label className="f">
            <span>تماس فنی (اختیاری)</span>
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </label>
          <ErrorNote error={act.error} />
          <div className="row">
            <button className="btn primary" disabled={act.busy || !form.scopes.length}>
              ساختن
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              انصراف
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!hook} onClose={() => setHook(null)} title={`وب‌هوک ${hook?.name ?? ""}`}>
        <form className="stack" onSubmit={(e) => (e.preventDefault(), saveHook(hookUrl.trim() || null))}>
          <p className="small muted">OPEX تغییر وضعیت درخواست‌ها و انتشار محتوا را با امضای HMAC به این نشانی می‌فرستد. با ذخیره، رمز تازه‌ای ساخته می‌شود و فقط یک بار نمایش داده می‌شود.</p>
          <label className="f">
            <span>نشانی (https)</span>
            <input dir="ltr" type="url" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://cms.example.com/opex/webhook" />
          </label>
          {hookSecret && (
            <div className="note warn">
              <div>رمز وب‌هوک (الان کپی کنید؛ دوباره نمایش داده نمی‌شود):</div>
              <div className="secret">{hookSecret}</div>
            </div>
          )}
          <ErrorNote error={act.error} />
          <div className="row">
            <button className="btn primary" disabled={act.busy || !hookUrl.trim()}>ذخیره و ساخت رمز تازه</button>
            {hook?.webhook_url && <button type="button" className="btn danger" disabled={act.busy} onClick={() => saveHook(null)}>خاموش کردن</button>}
          </div>
        </form>
      </Dialog>

      <Dialog open={!!rotate} onClose={() => setRotate(null)} title={`چرخش کلید: ${rotate?.name ?? ""}`}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rotate) return;
            act.run(async () => {
              await api(`/v1/manage/partners/${rotate.id}`, { method: "PATCH", body: { jwks: parseJwks(jwks) } });
              setRotate(null);
              list.reload();
            }, "کلیدها جایگزین شدند و همهٔ نشست‌های این شریک پایان یافت.");
          }}
        >
          <p className="small muted">کلید(های) عمومی تازه را وارد کنید. همهٔ نشست‌ها و توکن‌های فعلی این شریک باطل می‌شود.</p>
          <textarea dir="ltr" rows={6} required value={jwks} onChange={(e) => setJwks(e.target.value)} aria-label="JWKS تازه" />
          <ErrorNote error={act.error} />
          <button className="btn primary" disabled={act.busy}>
            جایگزینی کلیدها
          </button>
        </form>
      </Dialog>

      <Dialog open={!!usersOf} onClose={() => setUsersOf(null)} title={`کاربران ${usersOf?.name ?? ""}`} wide>
        {usersOf && <Users partner={usersOf} admin={admin} />}
      </Dialog>
    </>
  );
}
