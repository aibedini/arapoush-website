"use client";

import { Fragment, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { actionLabel, num, RESULT, when } from "@/lib/fa";
import { ErrorNote, Json, Loading, PageHead } from "@/components/ui";

type Row = {
  seq: number;
  id: string;
  ts: string;
  action: string;
  result: string;
  actor: { kind: string; id: string | null; display?: string; roles?: string[]; via_client?: string; session_id?: string; auth?: unknown } | null;
  request: { ip?: string; user_agent?: string; request_id?: string; method?: string; path?: string; asserted_end_user_ip?: string } | null;
  resource: Record<string, unknown> | null;
  changes: { op: string; path: string; old?: unknown; new?: unknown }[] | null;
  reason: string | null;
  hash: string;
};
const KEYS = ["action", "actor", "client", "ip", "resource", "path", "result", "from", "to"] as const;
type Filters = Partial<Record<(typeof KEYS)[number], string>>;

const qs = (f: Filters, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, k === "from" || k === "to" ? new Date(v).toISOString() : v);
  return p.toString();
};

function Audit() {
  const sp = useSearchParams();
  const initial = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])) as Filters, [sp]);
  const [form, setForm] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [pages, setPages] = useState<Row[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const list = useApi<Row[]>(`/v1/manage/audit?${qs(applied, { limit: "100" })}`);
  const rows = [...(list.data ?? []), ...pages];
  const more = useAction();
  const verify = useAction();
  const [chain, setChain] = useState<{ ok: boolean; checked: number; firstBad?: number } | null>(null);
  const exp = useAction();

  const loadMore = () =>
    more.run(async () => {
      const last = rows[rows.length - 1];
      if (!last) return;
      setPages([...pages, ...(await api<Row[]>(`/v1/manage/audit?${qs(applied, { limit: "100", before: String(last.seq) })}`))]);
    });
  const runVerify = () => verify.run(async () => setChain(await api(`/v1/manage/audit/verify`)));
  const runExport = () =>
    exp.run(async () => {
      const r = await api<Response>(`/v1/manage/audit/export?${qs(applied)}`, { raw: true });
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `opex-audit-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    }, "فایل خروجی ساخته شد؛ این خروجی خودش در گزارش ثبت شد.");

  const field = (k: keyof Filters, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="f">
      <span>{label}</span>
      <input dir="ltr" value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} />
    </label>
  );

  return (
    <>
      <PageHead title="گزارش رویدادها" sub="هر ورود، تغییر، انتشار و دسترسی ردشده: چه کسی، چه چیزی، کجا، از کدام IP">
        <button type="button" className="btn" onClick={runExport} disabled={exp.busy}>
          خروجی JSONL
        </button>
      </PageHead>
      <div className="grid">
        <form
          className="card card-body filters"
          onSubmit={(e) => {
            e.preventDefault();
            setPages([]);
            setApplied(form);
          }}
        >
          {field("action", "رویداد (مثل content.* )", { placeholder: "auth.*" })}
          {field("actor", "چه کسی (نام یا شناسه)")}
          {field("ip", "نشانی IP")}
          {field("client", "کلاینت شریک")}
          {field("resource", "منبع")}
          {field("path", "مسیر فیلد", { placeholder: "/hero/title" })}
          <label className="f">
            <span>نتیجه</span>
            <select value={form.result ?? ""} onChange={(e) => setForm({ ...form, result: e.target.value })}>
              <option value="">همه</option>
              <option value="success">موفق</option>
              <option value="failure">ناموفق</option>
              <option value="denied">رد شد</option>
            </select>
          </label>
          {field("from", "از", { type: "datetime-local" })}
          {field("to", "تا", { type: "datetime-local" })}
          <div className="row">
            <button className="btn primary">اعمال فیلتر</button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setForm({});
                setApplied({});
                setPages([]);
              }}
            >
              پاک کردن
            </button>
          </div>
        </form>

        <section className="card" id="verify" aria-labelledby="verify-h">
          <div className="card-head">
            <div>
              <h2 id="verify-h">بررسی یکپارچگی زنجیره</h2>
              <p className="small muted">هش همهٔ رویدادها از ابتدا دوباره محاسبه می‌شود.</p>
            </div>
            <button type="button" className="btn" onClick={runVerify} disabled={verify.busy}>
              {verify.busy ? "در حال بررسی…" : "بررسی"}
            </button>
          </div>
          {(chain || verify.error) && (
            <div className="card-body">
              <ErrorNote error={verify.error} />
              {chain && (chain.ok ? <div className="note ok">زنجیره سالم است؛ {num(chain.checked)} رویداد بررسی شد.</div> : <div className="note bad">زنجیره از رویداد شمارهٔ {num(chain.firstBad)} شکسته است. این یعنی پایگاه داده خارج از OPEX دست‌کاری شده؛ فوراً بررسی کنید.</div>)}
            </div>
          )}
        </section>

        <ErrorNote error={list.error ?? exp.error} />
        {exp.done && <div className="note ok">{exp.done}</div>}
        <section className="card" aria-label="رویدادها">
          {list.loading && !list.data ? (
            <div className="card-body">
              <Loading rows={8} />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">رویدادی با این فیلترها پیدا نشد.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>زمان</th>
                    <th>رویداد</th>
                    <th>چه کسی</th>
                    <th>IP</th>
                    <th>منبع</th>
                    <th>
                      <span className="sr-only">جزئیات</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.seq}>
                      <tr>
                        <td className="num small muted">{r.seq}</td>
                        <td className="small" style={{ whiteSpace: "nowrap" }}>
                          {when(r.ts)}
                        </td>
                        <td>
                          <div className="row">
                            <span>{actionLabel(r.action)}</span>
                            {r.result !== "success" && <span className={`badge ${r.result === "denied" ? "bad" : "warn"}`}>{RESULT[r.result]}</span>}
                          </div>
                          <code className="small muted">{r.action}</code>
                        </td>
                        <td>
                          <div>{r.actor?.display ?? r.actor?.id ?? "—"}</div>
                          <div className="small muted">
                            {r.actor?.kind}
                            {r.actor?.via_client ? ` · ${r.actor.via_client}` : ""}
                          </div>
                        </td>
                        <td>
                          <code>{r.request?.ip ?? "—"}</code>
                          {r.request?.asserted_end_user_ip && (
                            <div className="small muted">
                              کاربر نهایی: <code>{r.request.asserted_end_user_ip}</code>
                            </div>
                          )}
                        </td>
                        <td className="small">
                          {r.resource ? <code>{String(r.resource.entry ?? r.resource.type ?? r.resource.rule ?? "")}</code> : "—"}
                          {r.changes?.length ? <div className="muted">{num(r.changes.length)} تغییر</div> : null}
                        </td>
                        <td>
                          <button type="button" className="btn sm ghost" aria-expanded={open === r.seq} onClick={() => setOpen(open === r.seq ? null : r.seq)}>
                            جزئیات
                          </button>
                        </td>
                      </tr>
                      {open === r.seq && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                            <div className="stack">
                              {r.reason && (
                                <div>
                                  <b>دلیل:</b> {r.reason}
                                </div>
                              )}
                              {r.request?.user_agent && (
                                <div className="small">
                                  <b>مرورگر:</b> <code>{r.request.user_agent}</code>
                                </div>
                              )}
                              {r.changes?.length ? (
                                <div className="stack">
                                  {r.changes.slice(0, 50).map((c, i) => (
                                    <div key={i} className="small">
                                      <code>{c.path}</code>
                                      <div className="diff-old">{JSON.stringify(c.old)}</div>
                                      <div className="diff-new">{JSON.stringify(c.new)}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <Json value={{ id: r.id, actor: r.actor, request: r.request, resource: r.resource, hash: r.hash }} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length >= 100 && (
            <div className="card-body">
              <button type="button" className="btn" onClick={loadMore} disabled={more.busy}>
                رویدادهای قدیمی‌تر
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <Audit />
    </Suspense>
  );
}
