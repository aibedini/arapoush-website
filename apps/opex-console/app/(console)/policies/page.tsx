"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { num } from "@/lib/fa";
import type { CrSummary } from "@/lib/cr";
import { Dialog, ErrorNote, Json, Loading, PageHead } from "@/components/ui";

type Conditions = {
  maxItems?: number;
  textEditDistanceRatio?: { lte: number };
  maxLengthDelta?: number;
  noNewAssets?: boolean;
  assetsOnly?: boolean;
  noLinks?: boolean;
  principalRoles?: string[];
  timeWindow?: { tz: string; days?: string[]; from?: string; to?: string };
  entryCreate?: boolean;
  entryDelete?: boolean;
  requiresSecondApprover?: boolean;
  cooldown?: { maxPerHour: number };
};
type Policy = { id?: string; name: string; priority: number; scope: { partners?: string[]; types?: string[]; fields?: string[]; locales?: string[] }; conditions: Conditions; effect: "auto_approve" | "require_review" | "deny"; auto_publish: boolean; enabled: boolean };
type SimItem = { type: string; path: string; op: "set" | "insert" | "remove"; old?: unknown; value?: unknown };
type Outcome = { effect: string; autoPublish: boolean; fourEyes: boolean; policy: string | null; reasons: string[] };

const EFFECT: Record<string, string> = { auto_approve: "تأیید خودکار", require_review: "نیاز به بررسی", deny: "رد خودکار" };
const DAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
const DAY_FA: Record<string, string> = { sat: "شنبه", sun: "یکشنبه", mon: "دوشنبه", tue: "سه‌شنبه", wed: "چهارشنبه", thu: "پنجشنبه", fri: "جمعه" };
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const blank: Policy = { name: "", priority: 100, scope: { types: [] }, conditions: { maxItems: 5, textEditDistanceRatio: { lte: 0.2 }, noLinks: true, noNewAssets: true }, effect: "auto_approve", auto_publish: false, enabled: true };

/** One line per condition, in words, so operators read policies instead of JSON. */
function describe(p: Policy): string[] {
  const c = p.conditions;
  return [
    c.maxItems !== undefined && `حداکثر ${num(c.maxItems)} مورد`,
    c.textEditDistanceRatio && `تغییر متن حداکثر ${num(Math.round(c.textEditDistanceRatio.lte * 100))}٪`,
    c.maxLengthDelta !== undefined && `تغییر طول حداکثر ${num(c.maxLengthDelta)} نویسه`,
    c.noLinks && "بدون تغییر پیوند",
    c.noNewAssets && "بدون رسانهٔ تازه",
    c.assetsOnly && "فقط رسانه",
    c.principalRoles?.length && `فقط نقش‌های ${c.principalRoles.join("، ")}`,
    c.timeWindow && `${(c.timeWindow.days ?? []).map((d) => DAY_FA[d]).join("، ") || "هر روز"} ${c.timeWindow.from ?? "00:00"}–${c.timeWindow.to ?? "24:00"} (${c.timeWindow.tz})`,
    c.cooldown && `حداکثر ${num(c.cooldown.maxPerHour)} در ساعت برای هر کاربر`,
    c.entryCreate && "افزودن مورد مجاز",
    c.entryDelete && "حذف مورد مجاز",
    c.requiresSecondApprover && "دو تأییدکننده",
  ].filter(Boolean) as string[];
}

export default function Policies() {
  const me = useMe();
  const admin = me?.role === "super_admin";
  const list = useApi<Policy[]>("/v1/manage/policies");
  const types = useApi<{ key: string; label: string }[]>("/v1/manage/types");
  const crs = useApi<CrSummary[]>("/v1/manage/change-requests");
  const act = useAction();
  const [edit, setEdit] = useState<Policy | null>(null);
  const [simItems, setSimItems] = useState<SimItem[]>([{ type: "page.printing", path: "/hero/title@en", op: "set", old: "ARAPOUSH Tube Printing Technologies", value: "ARAPOUSH Tube Printing Technology" }]);
  const [simRole, setSimRole] = useState("aracms_editor");
  const [sim, setSim] = useState<{ key: string; out: Outcome } | null>(null);
  const key = useMemo(() => JSON.stringify([edit, simItems, simRole]), [edit, simItems, simRole]);

  const simulate = () =>
    act.run(async () => {
      const out = await api<Outcome>("/v1/manage/policies/simulate", { body: { items: simItems, role: simRole || null, ...(edit ? { policy: { ...edit, id: undefined } } : {}) } });
      setSim({ key, out });
    });
  const loadCr = (id: string) =>
    act.run(async () => {
      const cr = await api<{ items: { type_key: string; path: string; op: SimItem["op"]; old_value: unknown; new_value: unknown }[] }>(`/v1/manage/change-requests/${id}`);
      setSimItems(cr.items.map((i) => ({ type: i.type_key, path: i.path, op: i.op, old: i.old_value, value: i.new_value })));
    });
  const save = () =>
    act.run(async () => {
      const { id, ...body } = edit!;
      await api(id ? `/v1/manage/policies/${id}` : "/v1/manage/policies", { method: id ? "PUT" : "POST", body });
      setEdit(null);
      setSim(null);
      list.reload();
    }, "سیاست ذخیره شد.");
  const remove = (p: Policy) => confirm(`سیاست «${p.name}» حذف شود؟`) && act.run(async () => (await api(`/v1/manage/policies/${p.id}`, { method: "DELETE" }), list.reload()), "سیاست حذف شد.");

  const c = edit?.conditions ?? {};
  const setC = (patch: Partial<Conditions>) => setEdit((e) => (e ? { ...e, conditions: Object.fromEntries(Object.entries({ ...e.conditions, ...patch }).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length))) as Conditions } : e));
  const simulated = sim?.key === key;

  return (
    <>
      <PageHead title="سیاست‌های تأیید" sub="کدام پیشنهادهای آراسی‌ام‌اس خودکار تأیید (و منتشر) شوند و کدام بررسی شوند. پیش‌فرض: بررسی.">
        {admin && (
          <button type="button" className="btn primary" onClick={() => (setEdit(structuredClone(blank)), setSim(null))}>
            سیاست تازه
          </button>
        )}
      </PageHead>
      <div className="grid">
        <div className="note small">
          قانون‌های ثابت (قابل تغییر نیستند): بیش از ۵۰ مورد، تغییر پیوند در محتوای سراسری و رسانه‌ای که اسکنش تمام نشده همیشه بررسی می‌شوند. سیاست با اولویت بالاتر اول سنجیده می‌شود؛ اولین سیاستی که همهٔ شرط‌هایش برقرار باشد تصمیم می‌گیرد.
        </div>
        <ErrorNote error={act.error ?? list.error} />
        {act.done && <div className="note ok" role="status">{act.done}</div>}
        <div className="cols-2">
          <section className="card" aria-label="سیاست‌ها">
            {!list.data ? (
              <div className="card-body"><Loading /></div>
            ) : !list.data.length ? (
              <div className="empty">هنوز سیاستی نیست؛ همهٔ پیشنهادها بررسی می‌شوند.</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {list.data.map((p) => (
                  <li key={p.id} style={{ padding: "14px 18px", borderBlockEnd: "1px solid var(--line)" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="row">
                        <b>{p.name}</b>
                        <span className={`badge ${p.effect === "auto_approve" ? "ok" : p.effect === "deny" ? "bad" : "warn"}`}>{EFFECT[p.effect]}</span>
                        {p.auto_publish && <span className="badge accent">انتشار خودکار</span>}
                        {!p.enabled && <span className="badge">غیرفعال</span>}
                        <span className="small muted">اولویت {num(p.priority)}</span>
                      </span>
                      {admin && (
                        <span className="row">
                          <button type="button" className="btn sm" onClick={() => (setEdit(structuredClone(p)), setSim(null))}>ویرایش</button>
                          <button type="button" className="btn sm danger" onClick={() => remove(p)}>حذف</button>
                        </span>
                      )}
                    </div>
                    <div className="small muted" style={{ marginBlockStart: 4 }}>
                      {(p.scope.types ?? ["همهٔ محتوا"]).join("، ")}
                      {p.scope.fields?.length ? ` · ${p.scope.fields.join("، ")}` : ""}
                    </div>
                    <div className="row small" style={{ marginBlockStart: 4 }}>
                      {describe(p).map((d) => <span key={d} className="badge">{d}</span>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Simulator items={simItems} setItems={setSimItems} role={simRole} setRole={setSimRole} crs={crs.data ?? []} onLoad={loadCr} onRun={simulate} busy={act.busy} out={simulated || !edit ? sim?.out : undefined} />
        </div>
      </div>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "ویرایش سیاست" : "سیاست تازه"} wide>
        {edit && (
          <form className="stack" onSubmit={(e) => (e.preventDefault(), save())}>
            <div className="filters">
              <label className="f"><span>نام</span><input required minLength={2} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="f"><span>اولویت</span><input type="number" dir="ltr" min={0} max={10000} value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })} /></label>
              <label className="f">
                <span>نتیجه</span>
                <select value={edit.effect} onChange={(e) => setEdit({ ...edit, effect: e.target.value as Policy["effect"] })}>
                  {Object.entries(EFFECT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="check"><input type="checkbox" checked={edit.auto_publish} disabled={edit.effect !== "auto_approve"} onChange={(e) => setEdit({ ...edit, auto_publish: e.target.checked })} />انتشار خودکار پس از تأیید</label>
              <label className="check"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />فعال</label>
            </div>
            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small muted">محتوایی که این سیاست پوشش می‌دهد (برای تأیید خودکار الزامی)</legend>
              <div className="row">
                {types.data?.map((t) => (
                  <label key={t.key} className="check small">
                    <input type="checkbox" checked={!!edit.scope.types?.includes(t.key)} onChange={() => setEdit({ ...edit, scope: { ...edit.scope, types: edit.scope.types?.includes(t.key) ? edit.scope.types.filter((x) => x !== t.key) : [...(edit.scope.types ?? []), t.key] } })} />
                    <code>{t.key}</code>
                  </label>
                ))}
              </div>
              <label className="f"><span>فقط این فیلدها (الگو، اختیاری)</span><input dir="ltr" value={(edit.scope.fields ?? []).join(", ")} onChange={(e) => setEdit({ ...edit, scope: { ...edit.scope, fields: lines(e.target.value) } })} placeholder="/hero/**, /tech/**" /></label>
            </fieldset>
            <fieldset className="filters" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small muted" style={{ gridColumn: "1 / -1" }}>شرط‌ها (همه باید برقرار باشند)</legend>
              <label className="f"><span>حداکثر تعداد مورد</span><input type="number" dir="ltr" min={1} max={50} value={c.maxItems ?? ""} onChange={(e) => setC({ maxItems: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="f"><span>حداکثر درصد تغییر متن</span><input type="number" dir="ltr" min={0} max={100} value={c.textEditDistanceRatio ? Math.round(c.textEditDistanceRatio.lte * 100) : ""} onChange={(e) => setC({ textEditDistanceRatio: e.target.value ? { lte: Number(e.target.value) / 100 } : undefined })} /></label>
              <label className="f"><span>حداکثر تغییر طول (نویسه)</span><input type="number" dir="ltr" min={0} value={c.maxLengthDelta ?? ""} onChange={(e) => setC({ maxLengthDelta: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="f"><span>حداکثر در ساعت برای هر کاربر</span><input type="number" dir="ltr" min={1} value={c.cooldown?.maxPerHour ?? ""} onChange={(e) => setC({ cooldown: e.target.value ? { maxPerHour: Number(e.target.value) } : undefined })} /></label>
              <label className="f"><span>فقط این نقش‌ها</span><input dir="ltr" value={(c.principalRoles ?? []).join(", ")} onChange={(e) => setC({ principalRoles: lines(e.target.value) })} placeholder="aracms_editor" /></label>
            </fieldset>
            <div className="row">
              {([["noLinks", "بدون تغییر پیوند"], ["noNewAssets", "بدون رسانهٔ تازه"], ["assetsOnly", "فقط رسانه"], ["entryCreate", "افزودن مورد مجاز"], ["entryDelete", "حذف مورد مجاز"], ["requiresSecondApprover", "دو تأییدکننده"]] as const).map(([k, l]) => (
                <label key={k} className="check"><input type="checkbox" checked={!!c[k]} onChange={(e) => setC({ [k]: e.target.checked || undefined })} />{l}</label>
              ))}
            </div>
            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small muted">بازهٔ زمانی (به وقت تهران، اختیاری)</legend>
              <div className="row">
                {DAYS.map((d) => (
                  <label key={d} className="check small">
                    <input type="checkbox" checked={!!c.timeWindow?.days?.includes(d)} onChange={() => { const days = c.timeWindow?.days ?? []; const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; setC({ timeWindow: next.length || c.timeWindow?.from ? { tz: "Asia/Tehran", ...c.timeWindow, days: next } : undefined }); }} />
                    {DAY_FA[d]}
                  </label>
                ))}
                <input type="time" dir="ltr" style={{ maxInlineSize: 120 }} aria-label="از ساعت" value={c.timeWindow?.from ?? ""} onChange={(e) => setC({ timeWindow: { tz: "Asia/Tehran", ...c.timeWindow, from: e.target.value || undefined } })} />
                <input type="time" dir="ltr" style={{ maxInlineSize: 120 }} aria-label="تا ساعت" value={c.timeWindow?.to ?? ""} onChange={(e) => setC({ timeWindow: { tz: "Asia/Tehran", ...c.timeWindow, to: e.target.value || undefined } })} />
              </div>
            </fieldset>
            <div className="note">
              <b>شبیه‌سازی الزامی است.</b> پیش از ذخیره، این سیاست را روی نمونه‌ها (ستون سمت چپ صفحه یا یک درخواست واقعی) بسنجید.
              <div className="row" style={{ marginBlockStart: 8 }}>
                <button type="button" className="btn sm" onClick={simulate} disabled={act.busy}>شبیه‌سازی با این سیاست</button>
                {simulated && <span className={`badge ${sim!.out.effect === "auto_approve" ? "ok" : "warn"}`}>{EFFECT[sim!.out.effect]}{sim!.out.policy === "draft" ? " (همین سیاست)" : ""}</span>}
              </div>
              {simulated && <ul className="small" style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>{sim!.out.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            </div>
            <ErrorNote error={act.error} />
            <div className="row">
              <button className="btn primary" disabled={act.busy || !simulated}>ذخیره</button>
              <button type="button" className="btn" onClick={() => setEdit(null)}>انصراف</button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

function Simulator({ items, setItems, role, setRole, crs, onLoad, onRun, busy, out }: { items: SimItem[]; setItems: (v: SimItem[]) => void; role: string; setRole: (v: string) => void; crs: CrSummary[]; onLoad: (id: string) => void; onRun: () => void; busy: boolean; out?: Outcome }) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <section className="card" aria-labelledby="sim-h">
      <div className="card-head"><h2 id="sim-h">شبیه‌ساز</h2></div>
      <div className="card-body stack">
        <p className="small muted">با سیاست‌های فعلی، این پیشنهاد چه سرنوشتی دارد؟</p>
        <label className="f">
          <span>بارگذاری از یک درخواست</span>
          <select defaultValue="" onChange={(e) => e.target.value && onLoad(e.target.value)}>
            <option value="">—</option>
            {crs.slice(0, 50).map((c) => <option key={c.id} value={c.id}>{c.title} ({c.items})</option>)}
          </select>
        </label>
        <label className="f"><span>نقش نویسنده</span><input dir="ltr" value={role} onChange={(e) => setRole(e.target.value)} /></label>
        <label className="f">
          <span>موارد (JSON)</span>
          <textarea dir="ltr" rows={8} className="mono" value={raw ?? JSON.stringify(items, null, 1)} onChange={(e) => { setRaw(e.target.value); try { setItems(JSON.parse(e.target.value)); } catch {} }} />
        </label>
        <button type="button" className="btn" onClick={onRun} disabled={busy}>شبیه‌سازی</button>
        {out && (
          <div className={`note ${out.effect === "auto_approve" ? "ok" : out.effect === "deny" ? "bad" : "warn"}`}>
            <b>{EFFECT[out.effect]}</b>{out.autoPublish ? " و انتشار خودکار" : ""}{out.fourEyes ? " (دو تأییدکننده)" : ""}
            <ul className="small" style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>{out.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
        {out && <details><summary className="small muted">جزئیات</summary><Json value={out} /></details>}
      </div>
    </section>
  );
}
