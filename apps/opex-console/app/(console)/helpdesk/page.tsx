"use client";

import { useState } from "react";
import { EnvelopeSimple, Plus, Trash, UsersThree } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useAction, useApi, useMe } from "@/lib/hooks";
import { ago, LOCALE_LABEL, num, PRIORITY } from "@/lib/fa";
import { type Person, type SavedReply, type Team } from "@/lib/tickets";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

const PRIOS = ["urgent", "high", "normal", "low"] as const;
const DEFAULT: Record<string, { first: number; resolve: number }> = { urgent: { first: 60, resolve: 480 }, high: { first: 240, resolve: 1440 }, normal: { first: 480, resolve: 4320 }, low: { first: 1440, resolve: 10080 } };
const hours = (m: number) => Math.round((m / 60) * 10) / 10;

/** Teams, members and availability, SLA targets, saved replies and the helpdesk mailbox. */
export default function Helpdesk() {
  const me = useMe()!;
  const teams = useApi<Team[]>("/v1/manage/teams");
  const people = useApi<Person[]>("/v1/manage/helpdesk/people");
  const replies = useApi<SavedReply[]>("/v1/manage/saved-replies");
  const mailbox = useApi<{ address: string; inbound: boolean; outbound: boolean; state: { last_poll_at: string | null; last_error: string | null } | null; outbox: Record<string, number> }>("/v1/manage/helpdesk/mailbox");
  const prefs = useApi<{ emailNotifications?: boolean }>("/v1/manage/me/prefs");
  const act = useAction();
  const [newTeam, setNewTeam] = useState(false);
  const [edit, setEdit] = useState<SavedReply | "new" | null>(null);
  const admin = me.role === "super_admin";
  const lead = (t: Team) => admin || t.members.some((m) => m.id === me.id && m.role === "lead");

  return (
    <>
      <PageHead title="تیم‌ها و پاسخ‌های آماده" sub="چه کسی تیکت‌ها را می‌گیرد، تا کی باید پاسخ داد، و متن‌های پرتکرار.">
        {admin && (
          <button type="button" className="btn primary" onClick={() => setNewTeam(true)}>
            <Plus size={16} aria-hidden /> تیم تازه
          </button>
        )}
      </PageHead>
      <ErrorNote error={act.error ?? teams.error} />
      {act.done && (
        <div className="note ok" role="status">
          {act.done}
        </div>
      )}

      <div className="cols-2">
        <div className="stack">
          {!teams.data ? (
            <Loading />
          ) : (
            teams.data.map((t) => <TeamCard key={t.id} team={t} people={people.data ?? []} canEdit={lead(t)} admin={admin} meId={me.id} onChanged={teams.reload} act={act} />)
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>اعلان‌های من</h2>
            </div>
            <div className="card-body stack">
              <label className="check">
                <input
                  type="checkbox"
                  checked={prefs.data?.emailNotifications !== false}
                  onChange={(e) => act.run(async () => (await api("/v1/manage/me/prefs", { method: "PUT", body: { emailNotifications: e.target.checked } }), prefs.reload()))}
                />
                اعلان‌ها به ایمیل من هم فرستاده شود
              </label>
              <p className="small muted">ایمیل اعلان فقط شمارهٔ تیکت و پیوند کنسول را دارد، نه اطلاعات مشتری.</p>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="row">
                <EnvelopeSimple size={18} aria-hidden /> صندوق ایمیل پشتیبانی
              </h2>
            </div>
            <div className="card-body stack small">
              {!mailbox.data ? (
                <Loading rows={2} />
              ) : (
                <>
                  <div className="mono">{mailbox.data.address}</div>
                  <div className="row">
                    <span className={`badge ${mailbox.data.outbound ? "ok" : "warn"}`}>{mailbox.data.outbound ? "ارسال فعال" : "ارسال تنظیم نشده (SMTP_URL)"}</span>
                    <span className={`badge ${mailbox.data.inbound ? "ok" : "warn"}`}>{mailbox.data.inbound ? "دریافت فعال" : "دریافت تنظیم نشده (IMAP_URL)"}</span>
                  </div>
                  {mailbox.data.state?.last_poll_at && <div className="muted">آخرین بررسی صندوق: {ago(mailbox.data.state.last_poll_at)}</div>}
                  {mailbox.data.state?.last_error && <div className="note bad">{mailbox.data.state.last_error}</div>}
                  <div className="muted">
                    صف ارسال: {num(mailbox.data.outbox.pending ?? 0)} در انتظار · {num(mailbox.data.outbox.sent ?? 0)} فرستاده · {num(mailbox.data.outbox.dead ?? 0)} ناموفق
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>پاسخ‌های آماده</h2>
              <button type="button" className="btn sm" onClick={() => setEdit("new")}>
                <Plus size={14} aria-hidden /> پاسخ تازه
              </button>
            </div>
            <div className="card-body">
              {!replies.data?.length ? (
                <p className="small muted">پاسخ آماده‌ای نیست. متن‌هایی را که زیاد می‌نویسید اینجا بگذارید؛ {"{name}"} و {"{number}"} خودکار پر می‌شوند.</p>
              ) : (
                <ul className="plain">
                  {replies.data.map((r) => (
                    <li key={r.id} className="row" style={{ justifyContent: "space-between" }}>
                      <button type="button" className="btn ghost sm" onClick={() => setEdit(r)}>
                        {r.title}
                      </button>
                      <span className="small muted">{r.team ? teams.data?.find((t) => t.id === r.team)?.name : "همه"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <NewTeam open={newTeam} onClose={() => setNewTeam(false)} onDone={teams.reload} />
      {edit && <ReplyEditor reply={edit === "new" ? null : edit} teams={teams.data ?? []} onClose={() => setEdit(null)} onDone={replies.reload} />}
    </>
  );
}

function TeamCard({ team, people, canEdit, admin, meId, onChanged, act }: { team: Team; people: Person[]; canEdit: boolean; admin: boolean; meId: string; onChanged: () => void; act: ReturnType<typeof useAction> }) {
  const [sla, setSla] = useState(() => Object.fromEntries(PRIOS.map((p) => [p, { ...DEFAULT[p]!, ...team.sla[p] }])));
  const [add, setAdd] = useState("");
  const members = team.members;
  const saveMembers = (list: { id: string; role: string }[]) => act.run(async () => (await api(`/v1/manage/teams/${team.id}/members`, { method: "PUT", body: list }), onChanged()), "اعضا ذخیره شد.");
  const mine = members.find((m) => m.id === meId);
  return (
    <section className="card" aria-labelledby={`team-${team.id}`}>
      <div className="card-head">
        <div>
          <h2 id={`team-${team.id}`} className="row">
            <UsersThree size={18} aria-hidden /> {team.name} <span className="mono small muted">{team.key}</span>
          </h2>
          <p className="small muted">{num(team.open)} تیکت باز</p>
        </div>
        <div className="row">
          {mine && (
            <label className="check small">
              <input type="checkbox" checked={mine.available} onChange={(e) => act.run(async () => (await api("/v1/manage/me/availability", { body: { team: team.id, available: e.target.checked } }), onChanged()))} />
              من در دسترسم
            </label>
          )}
          {canEdit && (
            <label className="check small">
              <input type="checkbox" checked={team.auto_assign} onChange={(e) => act.run(async () => (await api(`/v1/manage/teams/${team.id}`, { method: "PATCH", body: { auto_assign: e.target.checked } }), onChanged()))} />
              تعیین خودکار مسئول
            </label>
          )}
          {admin && (
            <button type="button" className="btn sm danger icon-btn" aria-label={`حذف تیم ${team.name}`} onClick={() => confirm(`تیم «${team.name}» حذف شود؟ تیکت‌هایش بدون تیم می‌شوند.`) && act.run(async () => (await api(`/v1/manage/teams/${team.id}`, { method: "DELETE" }), onChanged()))}>
              <Trash size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className="card-body stack">
        <table>
          <thead>
            <tr>
              <th>عضو</th>
              <th>نقش</th>
              <th>در دسترس</th>
              {canEdit && <th className="sr-only">کارها</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  {canEdit ? (
                    <select aria-label={`نقش ${m.name}`} value={m.role} onChange={(e) => saveMembers(members.map((x) => ({ id: x.id, role: x.id === m.id ? e.target.value : x.role })))}>
                      <option value="agent">کارشناس</option>
                      <option value="lead">سرپرست</option>
                    </select>
                  ) : m.role === "lead" ? (
                    "سرپرست"
                  ) : (
                    "کارشناس"
                  )}
                </td>
                <td>{m.available ? <span className="badge ok">بله</span> : <span className="badge">خیر</span>}</td>
                {canEdit && (
                  <td>
                    <button type="button" className="btn sm ghost" onClick={() => saveMembers(members.filter((x) => x.id !== m.id).map((x) => ({ id: x.id, role: x.role })))}>
                      برداشتن
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="row">
            <select aria-label="افزودن عضو" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">افزودن همکار…</option>
              {people.filter((p) => !members.some((m) => m.id === p.id)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn sm" disabled={!add} onClick={() => (saveMembers([...members.map((x) => ({ id: x.id, role: x.role })), { id: add, role: "agent" }]), setAdd(""))}>
              افزودن
            </button>
          </div>
        )}
        <details>
          <summary>مهلت پاسخ (SLA)</summary>
          <table style={{ marginBlockStart: 8 }}>
            <thead>
              <tr>
                <th>اولویت</th>
                <th>اولین پاسخ (ساعت)</th>
                <th>حل (ساعت)</th>
              </tr>
            </thead>
            <tbody>
              {PRIOS.map((p) => (
                <tr key={p}>
                  <td>{PRIORITY[p]![0]}</td>
                  {(["first", "resolve"] as const).map((k) => (
                    <td key={k}>
                      <input
                        type="number"
                        min={0.1}
                        step={0.5}
                        aria-label={`${PRIORITY[p]![0]} ${k === "first" ? "اولین پاسخ" : "حل"}`}
                        disabled={!canEdit}
                        value={hours(sla[p]![k])}
                        onChange={(e) => setSla({ ...sla, [p]: { ...sla[p]!, [k]: Math.max(5, Math.round(Number(e.target.value) * 60)) } })}
                        style={{ inlineSize: 100 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <button type="button" className="btn sm primary" style={{ marginBlockStart: 8 }} onClick={() => act.run(async () => (await api(`/v1/manage/teams/${team.id}`, { method: "PATCH", body: { sla } }), onChanged()), "مهلت‌ها ذخیره شد.")}>
              ذخیرهٔ مهلت‌ها
            </button>
          )}
        </details>
      </div>
    </section>
  );
}

function NewTeam({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const act = useAction();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="تیم تازه"
      footer={
        <button type="button" className="btn primary" disabled={!name || !/^[a-z][a-z0-9-]{1,39}$/.test(key) || act.busy} onClick={() => act.run(async () => (await api("/v1/manage/teams", { body: { name, key } }), onDone(), onClose()))}>
          ساخت
        </button>
      }
    >
      <label className="f">
        <span>نام</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="پشتیبانی فنی" />
      </label>
      <label className="f">
        <span>کلید (انگلیسی، برای قواعد فرم)</span>
        <input dir="ltr" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="support" />
      </label>
      <ErrorNote error={act.error} />
    </Dialog>
  );
}

function ReplyEditor({ reply, teams, onClose, onDone }: { reply: SavedReply | null; teams: Team[]; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(reply?.title ?? "");
  const [team, setTeam] = useState(reply?.team ?? "");
  const [body, setBody] = useState(reply?.body ?? {});
  const act = useAction();
  const save = () => act.run(async () => (await api(reply ? `/v1/manage/saved-replies/${reply.id}` : "/v1/manage/saved-replies", { method: reply ? "PUT" : "POST", body: { title, team: team || null, body } }), onDone(), onClose()));
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={reply ? "ویرایش پاسخ آماده" : "پاسخ آمادهٔ تازه"}
      footer={
        <>
          {reply && (
            <button type="button" className="btn danger" style={{ marginInlineEnd: "auto" }} onClick={() => act.run(async () => (await api(`/v1/manage/saved-replies/${reply.id}`, { method: "DELETE" }), onDone(), onClose()))}>
              حذف
            </button>
          )}
          <button type="button" className="btn primary" disabled={!title.trim() || act.busy} onClick={save}>
            ذخیره
          </button>
        </>
      }
    >
      <div className="filters">
        <label className="f">
          <span>عنوان</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="f">
          <span>تیم</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">همهٔ تیم‌ها</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(["fa", "en", "tr"] as const).map((l) => (
        <label key={l} className="f">
          <span>{LOCALE_LABEL[l]}</span>
          <textarea dir={l === "fa" ? "rtl" : "ltr"} rows={4} value={body[l] ?? ""} onChange={(e) => setBody({ ...body, [l]: e.target.value })} />
        </label>
      ))}
      <p className="small muted">پاسخ به زبان مشتری درج می‌شود. {"{name}"} نام مشتری و {"{number}"} شمارهٔ تیکت است.</p>
      <ErrorNote error={act.error} />
    </Dialog>
  );
}
