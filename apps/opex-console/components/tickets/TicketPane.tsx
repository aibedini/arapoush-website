"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowBendUpLeft, ArrowLeft, ArrowsMerge, CheckCircle, Eye, HandGrabbing, Lock, Paperclip, PaperPlaneTilt, ShareFat, Prohibit, WarningCircle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { ago, bytes, dueIn, LOCALE_LABEL, num, PRIORITY, STATUS, when } from "@/lib/fa";
import { initials, pickL, type Person, type SavedReply, type Team, type TicketEvent, type TicketView } from "@/lib/tickets";
import { Dialog, ErrorNote, Loading } from "@/components/ui";

const SYSTEM_TEXT = (e: TicketEvent): string | null => {
  const m = e.meta as Record<string, string | null | string[] | boolean>;
  const who = e.actor.name ?? "سیستم";
  switch (e.kind) {
    case "viewed":
      return `${who} تیکت را باز کرد`;
    case "status":
      return m.auto ? `وضعیت خودکار به «${STATUS[m.to as string]?.[0]}» تغییر کرد${m.reason === "customer_reply" ? " (پاسخ مشتری)" : ""}` : `${who} وضعیت را «${STATUS[m.to as string]?.[0]}» کرد`;
    case "priority":
      return `${who} اولویت را «${PRIORITY[m.to as string]?.[0]}» کرد`;
    case "assigned":
      return m.to ? `${who} مسئولیت را به ${m.toName ?? "؟"} سپرد` : `${who} مسئول را برداشت`;
    case "team":
      return `${who} تیکت را به تیم ${m.name ?? "—"} برد`;
    case "tags":
      return `${who} برچسب‌ها را تغییر داد`;
    case "routed":
      return `مسیردهی خودکار${m.auto ? "؛ مسئول به‌صورت چرخشی تعیین شد" : ""}`;
    case "merged":
      return m.into ? `در تیکت #${num(m.into as unknown as number)} ادغام شد` : `تیکت #${num(m.from as unknown as number)} در این تیکت ادغام شد`;
    case "sla_breached":
      return m.target === "first" ? "مهلت اولین پاسخ گذشت" : "مهلت حل گذشت";
    default:
      return null;
  }
};

/** One ticket: conversation, composer and details. Every opening is recorded by the API. */
export function TicketPane({ number, people, teams, onChanged, onClose }: { number: number; people: Person[]; teams: Team[]; onChanged: () => void; onClose: () => void }) {
  const me = useMe()!;
  const v = useApi<TicketView>(`/v1/manage/tickets/${number}`);
  const replies = useApi<SavedReply[]>("/v1/manage/saved-replies");
  const act = useAction();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [after, setAfter] = useState("pending");
  const [mentions, setMentions] = useState<string[]>([]);
  const [refer, setRefer] = useState(false);
  const [merge, setMerge] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // Drafts survive switching tickets (per ticket and mode), in this browser only.
  const draftKey = `opex:draft:${number}:${mode}`;
  useEffect(() => {
    try {
      setText(localStorage.getItem(draftKey) ?? "");
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [text, draftKey]);

  useEffect(() => {
    if (v.data) {
      onChanged();
      end.current?.scrollIntoView({ block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.data?.ticket.id]);

  const done = useCallback(() => {
    v.reload();
    onChanged();
  }, [v, onChanged]);
  const patch = (body: Record<string, unknown>) => act.run(async () => (await api(`/v1/manage/tickets/${number}`, { method: "PATCH", body }), done()));
  const assign = (assignee: string | null) => act.run(async () => (await api(`/v1/manage/tickets/${number}/assign`, { body: { assignee } }), done()));

  const send = () =>
    act.run(async () => {
      if (!text.trim()) return;
      if (mode === "reply") await api(`/v1/manage/tickets/${number}/replies`, { body: { body: text, status: after } });
      else await api(`/v1/manage/tickets/${number}/notes`, { body: { body: text, mentions } });
      setText("");
      setMentions([]);
      done();
    }, mode === "reply" ? "پاسخ در صف ارسال ایمیل قرار گرفت." : "یادداشت ثبت شد.");

  // r / n / a / e shortcuts (not while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest("input, textarea, select, dialog")) return;
      if (e.key === "r" || e.key === "n") {
        e.preventDefault();
        setMode(e.key === "r" ? "reply" : "note");
        box.current?.focus();
      } else if (e.key === "a") assign(me.id);
      else if (e.key === "e") patch({ status: "resolved" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, me.id]);

  const data = v.data;
  const seenBy = useMemo(() => {
    if (!data) return () => [] as string[];
    return (e: TicketEvent) => data.reads.filter((r) => r.principal_id !== e.actor.id && new Date(r.last_read_at) >= new Date(e.created_at)).map((r) => r.display_name);
  }, [data]);

  if (!data)
    return (
      <section className="inbox-main" aria-busy="true">
        <ErrorNote error={v.error} />
        {!v.error && <Loading rows={8} />}
      </section>
    );
  const t = data.ticket;
  const r = data.data.requester;
  const answers = data.form?.fields.filter((f) => data.data.values[f.id] !== undefined) ?? [];
  const showAnswer = (f: NonNullable<TicketView["form"]>["fields"][number]) => {
    const val = data.data.values[f.id]!;
    if (typeof val === "boolean") return "✓";
    if (Array.isArray(val)) return val.map((x) => pickL(f.options?.find((o) => o.value === x)?.label) || x).join("، ");
    return f.options ? pickL(f.options.find((o) => o.value === val)?.label) || String(val) : String(val);
  };
  const visible = data.events.filter((e) => showViews || e.kind !== "viewed");
  const atts = (eventId: string) => data.attachments.filter((a) => a.event_id === eventId);
  const firstOpen = data.reads[0];

  return (
    <>
      <section className="inbox-main" aria-label={`تیکت ${t.number}`}>
        <header className="tk-head">
          <button type="button" className="btn ghost icon-btn back" onClick={onClose} aria-label="بازگشت به فهرست">
            <ArrowLeft size={20} aria-hidden />
          </button>
          <div style={{ minInlineSize: 0 }}>
            <h2 className="tk-title">{data.data.subject}</h2>
            <div className="row small muted">
              <span className="mono">#{t.number}</span>
              <span>{t.channel === "email" ? "ایمیل" : `فرم ${data.form?.slug ?? ""}`}</span>
              <span>{when(t.created_at)}</span>
              {t.merged_into && <span className="badge">ادغام‌شده در #{num(t.merged_into)}</span>}
            </div>
          </div>
          <div className="row tk-actions">
            {t.assignee?.id !== me.id && (
              <button type="button" className="btn sm" onClick={() => assign(me.id)} title="a">
                <HandGrabbing size={16} aria-hidden /> برداشتن
              </button>
            )}
            <button type="button" className="btn sm" onClick={() => setRefer(true)}>
              <ShareFat size={16} aria-hidden /> ارجاع
            </button>
            {t.status !== "resolved" && t.status !== "closed" ? (
              <button type="button" className="btn sm primary" onClick={() => patch({ status: "resolved" })} title="e">
                <CheckCircle size={16} aria-hidden /> حل‌شده
              </button>
            ) : (
              <button type="button" className="btn sm" onClick={() => patch({ status: "open" })}>
                باز کردن دوباره
              </button>
            )}
          </div>
        </header>

        <ErrorNote error={act.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}

        <div className="timeline" aria-live="polite">
          <label className="check small muted" style={{ justifySelf: "center" }}>
            <input type="checkbox" checked={showViews} onChange={(e) => setShowViews(e.target.checked)} /> نمایش بازدیدها
          </label>
          {visible.map((e) => {
            const sys = SYSTEM_TEXT(e);
            if (sys)
              return (
                <div key={e.id} className="ev-sys" data-kind={e.kind}>
                  {e.kind === "sla_breached" ? <WarningCircle size={14} weight="fill" aria-hidden /> : e.kind === "viewed" ? <Eye size={14} aria-hidden /> : null}
                  <span>{sys}</span>
                  <time dateTime={e.created_at}>{ago(e.created_at)}</time>
                </div>
              );
            const customer = e.actor.kind === "customer";
            const note = e.kind === "note" || e.kind === "referred" || e.kind === "transferred";
            const seen = seenBy(e);
            return (
              <article key={e.id} className="msg" data-side={customer ? "customer" : "staff"} data-note={note}>
                <header>
                  <span className="avatar">{initials(e.actor.name)}</span>
                  <b>{e.actor.name}</b>
                  <span className="small muted">
                    {e.kind === "submitted" ? "فرم را فرستاد" : e.kind === "reply_in" ? "ایمیل زد" : e.kind === "reply_out" ? "به مشتری پاسخ داد" : e.kind === "note" ? "یادداشت داخلی" : e.kind === "referred" ? `ارجاع به ${String(e.meta.toName ?? "")}` : `انتقال به ${String(e.meta.toName ?? "")}`}
                  </span>
                  {note && <Lock size={14} aria-label="فقط داخلی" />}
                  <time className="small muted" dateTime={e.created_at} title={when(e.created_at)}>
                    {ago(e.created_at)}
                  </time>
                </header>
                <div className="msg-body" dir="auto">
                  {e.body?.text}
                </div>
                {e.kind === "submitted" && data.data.context?.spec && <p className="small muted">{data.data.context.spec.join(" · ")}</p>}
                {atts(e.id).length > 0 && (
                  <ul className="atts">
                    {atts(e.id).map((a) => (
                      <li key={a.id}>
                        <a href={`/v1/manage/tickets/${t.number}/attachments/${a.id}`} download={a.name}>
                          <Paperclip size={14} aria-hidden /> {a.name} <span className="muted">({bytes(a.bytes)})</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {seen.length > 0 && (
                  <footer className="small muted">
                    <Eye size={13} aria-hidden /> دیده‌شده توسط {seen.join("، ")}
                  </footer>
                )}
              </article>
            );
          })}
          <div ref={end} />
        </div>

        <form
          className="composer"
          data-mode={mode}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="composer-tabs" role="tablist" aria-label="نوع پیام">
            <button type="button" role="tab" aria-selected={mode === "reply"} onClick={() => setMode("reply")} disabled={!r.email}>
              <ArrowBendUpLeft size={16} aria-hidden /> پاسخ به مشتری
            </button>
            <button type="button" role="tab" aria-selected={mode === "note"} onClick={() => setMode("note")}>
              <Lock size={16} aria-hidden /> یادداشت داخلی
            </button>
            {mode === "reply" && !!replies.data?.length && (
              <select
                aria-label="پاسخ آماده"
                value=""
                onChange={(e) => {
                  const s = replies.data!.find((x) => x.id === e.target.value);
                  if (s) setText((cur) => (cur ? cur + "\n\n" : "") + pickL(s.body, t.locale ?? "fa").replace(/\{name\}/g, r.name ?? "").replace(/\{number\}/g, String(t.number)));
                }}
              >
                <option value="">پاسخ آماده…</option>
                {replies.data.filter((s) => !s.team || s.team === t.team?.id).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label className="sr-only" htmlFor="composer-text">
            {mode === "reply" ? "متن پاسخ به مشتری" : "متن یادداشت داخلی"}
          </label>
          <textarea
            id="composer-text"
            ref={box}
            dir="auto"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "reply" ? `پاسخ به ${r.name ?? r.email ?? "مشتری"} (با ایمیل فرستاده می‌شود)` : "فقط همکاران می‌بینند. برای خبر دادن، همکار را در پایین انتخاب کنید."}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="row composer-foot">
            {mode === "reply" ? (
              <label className="row small">
                <span>بعد از ارسال:</span>
                <select value={after} onChange={(e) => setAfter(e.target.value)}>
                  <option value="pending">در انتظار مشتری</option>
                  <option value="open">باز بماند</option>
                  <option value="resolved">حل‌شده</option>
                </select>
              </label>
            ) : (
              <label className="row small">
                <span>خبر بده به:</span>
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !mentions.includes(id)) setMentions([...mentions, id]);
                  }}
                >
                  <option value="">انتخاب همکار…</option>
                  {people.filter((p) => p.id !== me.id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {mentions.map((m) => (
                  <button key={m} type="button" className="badge accent" onClick={() => setMentions(mentions.filter((x) => x !== m))} aria-label={`حذف ${people.find((p) => p.id === m)?.name}`}>
                    @{people.find((p) => p.id === m)?.name} ×
                  </button>
                ))}
              </label>
            )}
            <button className="btn primary" disabled={act.busy || !text.trim()} style={{ marginInlineStart: "auto" }}>
              <PaperPlaneTilt size={16} aria-hidden /> {mode === "reply" ? "ارسال پاسخ" : "ثبت یادداشت"}
            </button>
          </div>
        </form>
      </section>

      <aside className="inbox-side" aria-label="جزئیات تیکت">
        <div className="side-block">
          <label className="f">
            <span>وضعیت</span>
            <select value={t.status} onChange={(e) => patch({ status: e.target.value })}>
              {Object.entries(STATUS).map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            <span>اولویت</span>
            <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>
              {Object.entries(PRIORITY).map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            <span>تیم</span>
            <select value={t.team?.id ?? ""} onChange={(e) => patch({ team: e.target.value || null })}>
              <option value="">بدون تیم</option>
              {teams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            <span>مسئول</span>
            <select value={t.assignee?.id ?? ""} onChange={(e) => assign(e.target.value || null)}>
              <option value="">بدون مسئول</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === me.id ? " (من)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Tags tags={t.tags} onChange={(tags) => patch({ tags })} />
        </div>

        {(t.sla.next || t.sla.firstResponseAt) && (
          <div className="side-block">
            <h3>SLA</h3>
            {t.sla.next && (
              <p className={`sla big ${t.sla.breached ? "late" : ""}`}>
                {t.sla.breached && <WarningCircle size={16} weight="fill" aria-hidden />}
                {t.sla.kind === "first" ? "اولین پاسخ" : "حل"}: {dueIn(t.sla.next)}
              </p>
            )}
            {t.sla.firstResponseAt && <p className="small muted">اولین پاسخ: {when(t.sla.firstResponseAt)}</p>}
          </div>
        )}

        <div className="side-block">
          <h3>درخواست‌دهنده</h3>
          <div className="requester">
            <span className="avatar lg">{initials(r.name ?? r.email)}</span>
            <div style={{ minInlineSize: 0 }}>
              <b>{r.name ?? "—"}</b>
              {r.company && <div className="small">{r.company}</div>}
              {r.email && (
                <a className="small mono" href={`mailto:${r.email}`}>
                  {r.email}
                </a>
              )}
              {r.phone && (
                <a className="small mono" href={`tel:${r.phone}`} style={{ display: "block" }}>
                  {r.phone}
                </a>
              )}
            </div>
          </div>
          {data.history.length > 0 && (
            <details>
              <summary className="small">{num(data.history.length)} تیکت دیگر از همین شخص</summary>
              <ul className="plain small">
                {data.history.map((h) => (
                  <li key={h.number}>
                    <a href={`/tickets/${h.number}`}>#{h.number}</a> · {STATUS[h.status]?.[0]} · {ago(h.created_at)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {answers.length > 0 && (
          <div className="side-block">
            <h3>پاسخ‌های فرم</h3>
            <dl className="answers">
              {answers.map((f) => (
                <div key={f.id}>
                  <dt>{pickL(f.label) || f.id}</dt>
                  <dd dir="auto">{showAnswer(f)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="side-block">
          <h3>چه کسانی دیده‌اند</h3>
          {!data.reads.length ? (
            <p className="small muted">هنوز کسی.</p>
          ) : (
            <ul className="plain small">
              {data.reads.map((x) => (
                <li key={x.principal_id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    {x.display_name}
                    {firstOpen?.principal_id === x.principal_id && <span className="badge" style={{ marginInlineStart: 6 }}>اولین</span>}
                  </span>
                  <span className="muted" title={`اولین بار: ${when(x.first_opened_at)}`}>
                    {ago(x.last_read_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="side-block small muted">
          {t.page && <div>صفحه: <span className="mono">{t.page}</span></div>}
          {t.locale && <div>زبان: {LOCALE_LABEL[t.locale]}</div>}
          {t.ip && <div>IP: <span className="mono">{t.ip}</span></div>}
          <div className="row" style={{ marginBlockStart: 8 }}>
            <button type="button" className="btn sm" onClick={() => setMerge(true)}>
              <ArrowsMerge size={14} aria-hidden /> ادغام
            </button>
            {t.status !== "spam" ? (
              <button type="button" className="btn sm danger" onClick={() => confirm("این تیکت هرزنامه است؟ فرستنده ۳۰ روز مسدود می‌شود.") && act.run(async () => (await api(`/v1/manage/tickets/${number}/spam`, { body: { spam: true, block: true } }), done()))}>
                <Prohibit size={14} aria-hidden /> هرزنامه
              </button>
            ) : (
              <button type="button" className="btn sm" onClick={() => act.run(async () => (await api(`/v1/manage/tickets/${number}/spam`, { body: { spam: false } }), done()))}>
                هرزنامه نیست
              </button>
            )}
          </div>
        </div>
      </aside>

      <ReferDialog open={refer} onClose={() => setRefer(false)} number={number} people={people.filter((p) => p.id !== me.id)} teams={teams} onDone={done} />
      <MergeDialog open={merge} onClose={() => setMerge(false)} number={number} onDone={done} />
    </>
  );
}

function Tags({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="f">
      <span className="small muted">برچسب‌ها</span>
      <div className="row">
        {tags.map((x) => (
          <button key={x} type="button" className="badge" onClick={() => onChange(tags.filter((y) => y !== x))} aria-label={`حذف برچسب ${x}`}>
            {x} ×
          </button>
        ))}
        <input
          aria-label="برچسب تازه"
          placeholder="+ برچسب"
          value={v}
          style={{ inlineSize: 110, minBlockSize: 28, padding: "2px 8px" }}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) {
              e.preventDefault();
              onChange([...new Set([...tags, v.trim()])]);
              setV("");
            }
          }}
        />
      </div>
    </div>
  );
}

/** Refer (ارجاع) to a colleague or a team with a message; optionally hand over ownership. */
function ReferDialog({ open, onClose, number, people, teams, onDone }: { open: boolean; onClose: () => void; number: number; people: Person[]; teams: Team[]; onDone: () => void }) {
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [transfer, setTransfer] = useState(false);
  const act = useAction();
  const submit = () =>
    act.run(async () => {
      const [kind, id] = target.split(":");
      await api(`/v1/manage/tickets/${number}/refer`, { body: { ...(kind === "p" ? { to: id } : { team: id }), message, transfer } });
      setMessage("");
      setTarget("");
      onDone();
      onClose();
    });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ارجاع تیکت"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            انصراف
          </button>
          <button type="button" className="btn primary" disabled={!target || message.trim().length < 2 || act.busy} onClick={submit}>
            ارجاع
          </button>
        </>
      }
    >
      <label className="f">
        <span>به</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">انتخاب کنید…</option>
          <optgroup label="همکاران">
            {people.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="تیم‌ها">
            {teams.map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="f">
        <span>پیام (فقط داخلی)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="مثلاً: لطفاً قیمت ویژه را تأیید کنید." />
      </label>
      <label className="check">
        <input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} /> مسئولیت هم منتقل شود
      </label>
      <p className="small muted">بدون انتقال، تیکت مال شما می‌ماند و همکار فقط خبردار می‌شود و آن را می‌بیند.</p>
      <ErrorNote error={act.error} />
    </Dialog>
  );
}

function MergeDialog({ open, onClose, number, onDone }: { open: boolean; onClose: () => void; number: number; onDone: () => void }) {
  const [into, setInto] = useState("");
  const act = useAction();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`ادغام تیکت #${number}`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!/^\d+$/.test(into) || act.busy}
            onClick={() =>
              act.run(async () => {
                await api(`/v1/manage/tickets/${number}/merge`, { body: { into: Number(into) } });
                onDone();
                onClose();
              })
            }
          >
            ادغام
          </button>
        </>
      }
    >
      <label className="f">
        <span>شمارهٔ تیکت مقصد</span>
        <input inputMode="numeric" dir="ltr" value={into} onChange={(e) => setInto(e.target.value.replace(/\D/g, ""))} placeholder="1042" />
      </label>
      <p className="small muted">همهٔ پیام‌ها و پیوست‌ها به تیکت مقصد می‌روند و این تیکت بسته می‌شود.</p>
      <ErrorNote error={act.error} />
    </Dialog>
  );
}
