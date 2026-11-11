"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { LOCALE_LABEL, ago, num, when } from "@/lib/fa";
import { show, splitLocale, wordDiff } from "@/lib/diff";
import { PreviewFrames } from "@/components/PreviewFrames";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";
import { STATE } from "@/lib/cr";

type Item = { id: string; type_key: string; path: string; op: "set" | "insert" | "remove"; old_value: unknown; new_value: unknown; current: unknown; stale: boolean; decision: "approved" | "rejected" | null; decision_reason: string | null; added_by: string | null };
type Cr = {
  id: string;
  title: string;
  note: string | null;
  state: string;
  author: string | null;
  author_role: string | null;
  partner: string | null;
  created_at: string;
  decided_at: string | null;
  decision: { effect: string; policy: string | null; reasons: string[] } | null;
  conflicts: { item: string; path: string; expected: unknown; current: unknown }[] | null;
  four_eyes: boolean;
  approvals: { by: string; at: string }[];
  decision_reason: string | null;
  items: Item[];
};

function Diff({ a, b, locale }: { a: unknown; b: unknown; locale: string | null }) {
  const dir = locale === "fa" ? "rtl" : locale ? "ltr" : undefined;
  if (typeof a === "string" && typeof b === "string")
    return (
      <p dir={dir} lang={locale ?? undefined} style={{ margin: 0, lineHeight: 1.9 }}>
        {wordDiff(a, b).map((p, i) =>
          p.kind === "same" ? <span key={i}>{p.text}</span> : p.kind === "add" ? <ins key={i} className="diff-new" style={{ textDecoration: "none", background: "var(--ok-soft)" }}>{p.text}</ins> : <del key={i} className="diff-old" style={{ background: "var(--bad-soft)" }}>{p.text}</del>,
        )}
      </p>
    );
  const img = (v: unknown) => (v && typeof v === "object" && typeof (v as { src?: unknown }).src === "string" ? (v as { src: string }).src : null);
  if (img(a) || img(b))
    return (
      <div className="row" style={{ alignItems: "center" }}>
        {[a, b].map((v, i) => (
          <figure key={i} style={{ margin: 0 }}>
            {img(v) ? <img className="thumb" src={img(v)!.startsWith("/media/") ? `/v1/manage/media/${img(v)!.slice(7)}/raw` : img(v)!} alt="" /> : <div className="thumb" />}
            <figcaption className="small muted">{i ? "پیشنهاد" : "قبلی"}</figcaption>
          </figure>
        ))}
      </div>
    );
  return (
    <div className="stack" style={{ gap: 4 }}>
      <code className="diff-old small">{show(a)}</code>
      <code className="diff-new small">{show(b)}</code>
    </div>
  );
}

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data: cr, error, reload: refetch } = useApi<Cr>(`/v1/manage/change-requests/${id}`);
  const reload = useCallback(() => {
    refetch();
    window.dispatchEvent(new Event("opex:requests-changed"));
  }, [refetch]);
  const act = useAction();
  // Local decisions before submitting: everything approved unless the reviewer says otherwise.
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState(0);
  const [amend, setAmend] = useState<Item | null>(null);
  const [amendValue, setAmendValue] = useState("");
  const [rejectAll, setRejectAll] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(false);
  const rows = useRef<(HTMLElement | null)[]>([]);

  const items = useMemo(() => (cr?.items ?? []).filter((i) => !(i.decision === "rejected" && i.decision_reason === "amended by operator")), [cr]);
  const open = cr?.state === "pending_review" || cr?.state === "submitted";
  const writable = canWrite(me) && open;
  const toggle = useCallback((it: Item) => setRejected((r) => (it.id in r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== it.id)) : { ...r, [it.id]: "" })), []);

  // Keyboard review: j/k move, x toggles reject, a approves all, e amends the focused item.
  useEffect(() => {
    if (!writable) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, dialog")) return;
      if (e.key === "j" || e.key === "ArrowDown") setFocus((f) => Math.min(items.length - 1, f + 1));
      else if (e.key === "k" || e.key === "ArrowUp") setFocus((f) => Math.max(0, f - 1));
      else if (e.key === "x" && items[focus]) toggle(items[focus]!);
      else if (e.key === "e" && items[focus]?.op === "set" && typeof items[focus]!.new_value === "string") {
        setAmend(items[focus]!);
        setAmendValue(items[focus]!.new_value as string);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [writable, items, focus, toggle]);
  useEffect(() => rows.current[focus]?.scrollIntoView({ block: "nearest" }), [focus]);

  const approve = (publish: boolean) =>
    act.run(
      async () => {
        const decisions = Object.fromEntries(Object.entries(rejected).map(([k, r]) => [k, { decision: "rejected" as const, ...(r ? { reason: r } : {}) }]));
        const r = await api<{ state: string }>(`/v1/manage/change-requests/${id}/approve`, { body: { publish, decisions } });
        reload();
        return r;
      },
      publish ? "تأیید و منتشر شد." : "تأیید شد؛ برای نمایش روی سایت منتشر کنید.",
    );
  const publishNow = () => act.run(async () => (await api(`/v1/manage/change-requests/${id}/publish`, { body: {} }), reload()), "منتشر شد.");
  const doReject = () =>
    act.run(async () => {
      await api(`/v1/manage/change-requests/${id}/reject`, { body: { reason } });
      setRejectAll(false);
      reload();
    }, "درخواست رد شد و آراسی‌ام‌اس باخبر شد.");
  const doAmend = () =>
    act.run(async () => {
      await api(`/v1/manage/change-requests/${id}/amend`, { body: { item: amend!.id, value: amendValue } });
      setAmend(null);
      reload();
    }, "مقدار اصلاح شد؛ نسخهٔ اصلی برای سابقه نگه داشته شد.");

  if (error) return <ErrorNote error={error} />;
  if (!cr) return <Loading rows={10} />;
  const nRejected = Object.keys(rejected).length;
  const stale = items.filter((i) => i.stale && !i.decision).length;
  const byEntry = new Map<string, Item[]>();
  items.forEach((i) => byEntry.set(i.type_key, [...(byEntry.get(i.type_key) ?? []), i]));
  let idx = -1;

  return (
    <>
      <PageHead title={<bdi>{cr.title}</bdi> as unknown as string} sub={`${cr.author ?? "—"} · ${cr.partner ?? "اپراتور"} · ${ago(cr.created_at)}`}>
        <span className={`badge ${STATE[cr.state]?.tone ?? ""}`}>{STATE[cr.state]?.label ?? cr.state}</span>
        <Link className="btn" href="/requests">
          بازگشت
        </Link>
      </PageHead>
      <div className="editor">
        <div className="stack">
          {cr.note && <div className="note" dir="auto">{cr.note}</div>}
          {cr.conflicts?.length ? (
            <div className="note warn">
              <b>محتوا پس از این درخواست تغییر کرده است.</b> آراسی‌ام‌اس باید درخواست را با نسخهٔ تازه دوباره بفرستد.
              <ul className="small" style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                {cr.conflicts.map((c) => (
                  <li key={c.item}>
                    <code>{c.path}</code>: اکنون «{show(c.current)}»
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {writable && <p className="small muted">میان‌بُر: j / k حرکت، x رد یا تأیید مورد، e اصلاح متن.</p>}
          {[...byEntry].map(([type, list]) => (
            <section key={type} className="card" aria-label={type}>
              <div className="card-head">
                <h2>
                  <code>{type}</code>
                </h2>
                <span className="small muted">{num(list.length)} مورد</span>
              </div>
              <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {list.map((it) => {
                  idx += 1;
                  const i = idx;
                  const { path, locale } = splitLocale(it.path);
                  const off = it.id in rejected || it.decision === "rejected";
                  return (
                    <li
                      key={it.id}
                      ref={(el) => {
                        rows.current[i] = el;
                      }}
                      onClick={() => setFocus(i)}
                      style={{ padding: "12px 18px", borderBlockEnd: "1px solid var(--line)", background: focus === i && writable ? "var(--accent-soft)" : undefined, opacity: off ? 0.55 : 1 }}
                    >
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <span className="row">
                          <code className="small">{path}</code>
                          {locale && <span className="badge">{LOCALE_LABEL[locale]}</span>}
                          {it.op !== "set" && <span className="badge accent">{it.op === "insert" ? "افزودن مورد" : "حذف مورد"}</span>}
                          {it.added_by && <span className="badge accent">اصلاح اپراتور</span>}
                          {it.stale && !it.decision && <span className="badge warn">از زمان درخواست تغییر کرده</span>}
                          {it.decision && <span className={`badge ${it.decision === "approved" ? "ok" : "bad"}`}>{it.decision === "approved" ? "تأیید" : "رد"}</span>}
                        </span>
                        {writable && (
                          <span className="row">
                            {it.op === "set" && typeof it.new_value === "string" && (
                              <button type="button" className="btn sm ghost" onClick={() => (setAmend(it), setAmendValue(it.new_value as string))}>
                                اصلاح
                              </button>
                            )}
                            <label className="check small">
                              <input type="checkbox" checked={!(it.id in rejected)} onChange={() => toggle(it)} aria-label={`تأیید ${path}${locale ? ` ${LOCALE_LABEL[locale]}` : ""}`} />
                              تأیید
                            </label>
                          </span>
                        )}
                      </div>
                      <div style={{ marginBlockStart: 6 }}>
                        <Diff a={it.op === "insert" ? null : it.old_value} b={it.op === "remove" ? null : it.new_value} locale={locale} />
                      </div>
                      {it.stale && !it.decision && (
                        <div className="small muted" style={{ marginBlockStart: 4 }}>
                          مقدار فعلی پیش‌نویس: «{show(it.current)}»
                        </div>
                      )}
                      {writable && it.id in rejected && (
                        <input style={{ marginBlockStart: 6 }} placeholder="دلیل رد (برای آراسی‌ام‌اس)" aria-label={`دلیل رد ${path}`} value={rejected[it.id]} maxLength={500} onChange={(e) => setRejected({ ...rejected, [it.id]: e.target.value })} />
                      )}
                      {it.decision_reason && <div className="small muted">دلیل: {it.decision_reason}</div>}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
        <aside className="aside">
          <section className="card" aria-label="تصمیم">
            <div className="card-body stack">
              {cr.decision && (
                <div className="small">
                  <div>
                    سیاست: <b>{cr.decision.effect === "require_review" ? "نیاز به بررسی" : cr.decision.effect === "auto_approve" ? "تأیید خودکار" : "رد"}</b>
                  </div>
                  <ul className="muted" style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
                    {cr.decision.reasons.slice(0, 5).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {cr.four_eyes && <div className="note">این درخواست دو تأییدکنندهٔ متفاوت لازم دارد ({num(cr.approvals.length)} از ۲).</div>}
              <ErrorNote error={act.error} />
              {act.done && <div className="note ok" role="status">{act.done}</div>}
              {writable && (
                <>
                  <div className="small">
                    {num(items.length - nRejected)} تأیید · {num(nRejected)} رد{stale ? ` · ${num(stale)} مورد تغییرکرده` : ""}
                  </div>
                  <div className="row">
                    <button type="button" className="btn primary" disabled={act.busy || nRejected === items.length} onClick={() => approve(true)}>
                      تأیید و انتشار
                    </button>
                    <button type="button" className="btn" disabled={act.busy || nRejected === items.length} onClick={() => approve(false)}>
                      فقط تأیید
                    </button>
                  </div>
                  <button type="button" className="btn danger" disabled={act.busy} onClick={() => setRejectAll(true)}>
                    رد کل درخواست
                  </button>
                </>
              )}
              {canWrite(me) && cr.state === "approved" && (
                <button type="button" className="btn primary" disabled={act.busy} onClick={publishNow}>
                  انتشار
                </button>
              )}
              <button type="button" className="btn sm" onClick={() => setPreview(true)}>
                پیش‌نمایش روی سایت (۳ اندازه)
              </button>
              {cr.decided_at && <div className="small muted">تصمیم: {when(cr.decided_at)}</div>}
              {cr.decision_reason && <div className="small muted">دلیل: {cr.decision_reason}</div>}
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={!!amend} onClose={() => setAmend(null)} title="اصلاح پیش از تأیید">
        {amend && (
          <form className="stack" onSubmit={(e) => (e.preventDefault(), doAmend())}>
            <code className="small">{amend.path}</code>
            <textarea dir={splitLocale(amend.path).locale === "fa" ? "rtl" : "ltr"} rows={4} value={amendValue} onChange={(e) => setAmendValue(e.target.value)} aria-label="مقدار اصلاح‌شده" />
            <p className="small muted">مقدار پیشنهادی آراسی‌ام‌اس برای سابقه نگه داشته و «اصلاح‌شده» علامت می‌خورد.</p>
            <ErrorNote error={act.error} />
            <button className="btn primary" disabled={act.busy}>
              ذخیرهٔ اصلاح
            </button>
          </form>
        )}
      </Dialog>
      <Dialog open={rejectAll} onClose={() => setRejectAll(false)} title="رد کل درخواست">
        <form className="stack" onSubmit={(e) => (e.preventDefault(), doReject())}>
          <label className="f">
            <span>دلیل (برای آراسی‌ام‌اس)</span>
            <textarea required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button className="btn danger" disabled={act.busy}>
            رد درخواست
          </button>
        </form>
      </Dialog>
      <PreviewFrames open={preview} onClose={() => setPreview(false)} type={items[0]?.type_key ?? "page.home.hero"} cr={cr.id} />
    </>
  );
}
