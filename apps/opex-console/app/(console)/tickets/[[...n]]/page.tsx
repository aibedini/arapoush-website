"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnvelopeSimple, FunnelSimple, Keyboard, MagnifyingGlass, NotePencil, Tray, WarningCircle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { ago, dueIn, num, PRIORITY, STATUS, VIEW_LABEL } from "@/lib/fa";
import { initials, ticketsChanged, type ListItem, type Person, type Team } from "@/lib/tickets";
import { Dialog, ErrorNote, Loading } from "@/components/ui";
import { TicketPane } from "@/components/tickets/TicketPane";

const VIEWS = ["mine", "unassigned", "teams", "all", "overdue", "waiting", "closed", "spam"] as const;
type View = (typeof VIEWS)[number];

/**
 * The helpdesk inbox: views on the start side, the conversation in the middle, details at the end.
 * Deep links: /tickets/1042?view=mine. Keyboard: j/k move, r reply, n note, a take, e resolve, ? help.
 */
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const params = useParams<{ n?: string[] }>();
  const search = useSearchParams();
  const router = useRouter();
  const current = params.n?.[0] ? Number(params.n[0]) : null;
  const view = (VIEWS.includes(search.get("view") as View) ? search.get("view") : "mine") as View;
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [priority, setPriority] = useState("");
  const [team, setTeam] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [help, setHelp] = useState(false);
  const qs = new URLSearchParams({ view, ...(term ? { q: term } : {}), ...(priority ? { priority } : {}), ...(team ? { team } : {}) });
  const list = useApi<ListItem[]>(`/v1/manage/tickets?${qs}`);
  const counts = useApi<Record<string, number>>("/v1/manage/tickets/counts");
  const people = useApi<Person[]>("/v1/manage/helpdesk/people");
  const teams = useApi<Team[]>("/v1/manage/teams");
  const bulk = useAction();

  // Debounced search; refresh every 30 s and after any change elsewhere.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const refresh = useCallback(() => {
    list.reload();
    counts.reload();
    ticketsChanged();
  }, [list, counts]);
  useEffect(() => {
    const t = setInterval(() => {
      list.reload();
      counts.reload();
    }, 30_000);
    return () => clearInterval(t);
  }, [list, counts]);

  const items = useMemo(() => list.data ?? [], [list.data]);
  const go = useCallback((n: number | null, v: View = view) => router.push(`/tickets${n ? `/${n}` : ""}?view=${v}`), [router, view]);
  const listRef = useRef<HTMLUListElement>(null);

  // j / k move through the list (skipped while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      if (e.key === "?") return setHelp(true);
      if (e.key !== "j" && e.key !== "k") return;
      const i = items.findIndex((x) => x.number === current);
      const next = items[e.key === "j" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1)];
      if (next) {
        e.preventDefault();
        go(next.number);
        listRef.current?.querySelector<HTMLElement>(`[data-n="${next.number}"]`)?.scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [items, current, go]);

  const toggle = (id: string) => setSelected((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const runBulk = (body: Record<string, unknown>) =>
    bulk.run(async () => {
      await api("/v1/manage/tickets/bulk", { body: { ids: [...selected], ...body } });
      setSelected(new Set());
      refresh();
    }, "انجام شد.");

  return (
    <div className="inbox" data-open={!!current}>
      <section className="inbox-list" aria-label="فهرست تیکت‌ها">
        <div className="inbox-head">
          <h1 className="row" style={{ gap: 8 }}>
            <Tray size={22} aria-hidden /> تیکت‌ها
          </h1>
          <button type="button" className="btn ghost icon-btn" onClick={() => setHelp(true)} aria-label="میان‌برهای صفحه‌کلید">
            <Keyboard size={20} aria-hidden />
          </button>
        </div>
        <nav className="views" aria-label="نماها">
          {VIEWS.map((v) => (
            <button key={v} type="button" className="view-tab" aria-pressed={v === view} onClick={() => go(current, v)}>
              <span>{VIEW_LABEL[v]}</span>
              {!!counts.data?.[v] && v !== "closed" && v !== "spam" && <span className={`badge ${v === "overdue" ? "bad" : ""}`}>{num(counts.data[v])}</span>}
            </button>
          ))}
        </nav>
        <div className="inbox-tools">
          <label className="search">
            <MagnifyingGlass size={16} aria-hidden />
            <span className="sr-only">جستجو</span>
            <input type="search" placeholder="شماره، موضوع، نام یا ایمیل" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <details className="filters-pop">
            <summary className="btn sm" aria-label="فیلترها">
              <FunnelSimple size={16} aria-hidden /> فیلتر{priority || team ? " •" : ""}
            </summary>
            <div className="pop stack">
              <label className="f">
                <span>اولویت</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="">همه</option>
                  {Object.entries(PRIORITY).map(([k, [l]]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="f">
                <span>تیم</span>
                <select value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">همه</option>
                  <option value="none">بدون تیم</option>
                  {teams.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
        {selected.size > 0 && (
          <div className="bulk" role="region" aria-label="کار گروهی">
            <span className="small">{num(selected.size)} انتخاب‌شده</span>
            <select aria-label="مسئول" defaultValue="" onChange={(e) => e.target.value && runBulk({ assignee: e.target.value === "none" ? null : e.target.value })}>
              <option value="">مسئول…</option>
              <option value="none">بدون مسئول</option>
              {people.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select aria-label="وضعیت" defaultValue="" onChange={(e) => e.target.value && runBulk({ status: e.target.value })}>
              <option value="">وضعیت…</option>
              {Object.entries(STATUS).map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <button type="button" className="btn sm ghost" onClick={() => setSelected(new Set())}>
              لغو
            </button>
          </div>
        )}
        <ErrorNote error={list.error ?? bulk.error} />
        {list.loading && !list.data ? (
          <div className="card-body">
            <Loading rows={6} />
          </div>
        ) : !items.length ? (
          <div className="empty">
            <Tray size={36} aria-hidden />
            <p>{term ? "چیزی پیدا نشد." : view === "mine" ? "تیکت بازی به شما سپرده نشده است." : "این نما خالی است."}</p>
          </div>
        ) : (
          <ul className="tickets" ref={listRef}>
            {items.map((t) => (
              <li key={t.id} data-n={t.number} className="tk" aria-current={t.number === current ? "true" : undefined} data-unread={t.unread}>
                <input type="checkbox" aria-label={`انتخاب تیکت ${t.number}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <Link href={`/tickets/${t.number}?view=${view}`} className="tk-link">
                  <span className="tk-top">
                    <span className="tk-who">{t.requester.name || t.requester.email || "بی‌نام"}</span>
                    <time className="small muted" dateTime={t.last_activity_at}>
                      {ago(t.last_activity_at)}
                    </time>
                  </span>
                  <span className="tk-subj">{t.subject}</span>
                  <span className="tk-meta">
                    <span className="mono small muted">#{t.number}</span>
                    {t.channel === "email" ? <EnvelopeSimple size={14} aria-label="ایمیل" /> : <NotePencil size={14} aria-label={`فرم ${t.form ?? ""}`} />}
                    <span className={`badge ${STATUS[t.status]?.[1] ?? ""}`}>{STATUS[t.status]?.[0] ?? t.status}</span>
                    {(t.priority === "high" || t.priority === "urgent") && <span className={`badge ${PRIORITY[t.priority]![1]}`}>{PRIORITY[t.priority]![0]}</span>}
                    {t.sla.next && (
                      <span className={`sla ${t.sla.breached ? "late" : ""}`} title={t.sla.kind === "first" ? "تا اولین پاسخ" : "تا حل"}>
                        {t.sla.breached && <WarningCircle size={13} weight="fill" aria-hidden />}
                        {dueIn(t.sla.next)}
                      </span>
                    )}
                    <span className="avatar sm" title={t.assignee?.name ?? "بدون مسئول"} aria-label={`مسئول: ${t.assignee?.name ?? "ندارد"}`} data-empty={!t.assignee}>
                      {t.assignee ? initials(t.assignee.name) : "—"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {current ? (
        <TicketPane key={current} number={current} people={people.data ?? []} teams={teams.data ?? []} onChanged={refresh} onClose={() => go(null)} />
      ) : (
        <section className="inbox-empty" aria-label="تیکت">
          <Tray size={48} weight="thin" aria-hidden />
          <p>یک تیکت را انتخاب کنید.</p>
          <p className="small muted">با کلیدهای j و k بین تیکت‌ها جابه‌جا شوید.</p>
        </section>
      )}

      <Dialog open={help} onClose={() => setHelp(false)} title="میان‌برهای صفحه‌کلید">
        <table>
          <tbody>
            {[
              ["j / k", "تیکت بعدی / قبلی"],
              ["r", "پاسخ به مشتری"],
              ["n", "یادداشت داخلی"],
              ["a", "برداشتن تیکت (مسئول شدن)"],
              ["e", "حل‌شده"],
              ["Ctrl + Enter", "ارسال"],
              ["?", "همین راهنما"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog>
    </div>
  );
}
