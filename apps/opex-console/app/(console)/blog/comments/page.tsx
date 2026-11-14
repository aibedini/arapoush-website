"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { ago, num } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { LOCALE_NAME } from "../_components/lib";

type Status = "pending" | "approved" | "spam" | "trash";
type Comment = { id: string; postId: string; postTitle: string; locale: "fa" | "en" | "tr"; parentId: string | null; name: string; email: string | null; body: string; status: Status; team: boolean; createdAt: string };
const TABS: [Status | "", string][] = [
  ["pending", "در انتظار"],
  ["approved", "منتشرشده"],
  ["spam", "اسپم"],
  ["trash", "زباله‌دان"],
  ["", "همه"],
];

/** Comment moderation: approve, answer as the team, spam, trash or delete. */
export default function BlogComments() {
  const [tab, setTab] = useState<Status | "">("pending");
  const list = useApi<{ items: Comment[]; pending: number }>(`/v1/manage/blog/comments${tab ? `?status=${tab}` : ""}`);
  const act = useAction();
  const [reply, setReply] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<unknown>, ok: string) =>
    act.run(async () => {
      await fn();
      list.reload();
    }, ok);
  const moderate = (c: Comment, status: Status) => run(() => api(`/v1/manage/blog/comments/${c.id}/moderate`, { body: { status } }), "انجام شد.");

  return (
    <>
      <div className="small" style={{ marginBlockEnd: 8 }}>
        <Link href="/blog">بلاگ</Link> / دیدگاه‌ها
      </div>
      <PageHead title="دیدگاه‌ها" sub={list.data ? `${num(list.data.pending)} دیدگاه در انتظار بررسی` : undefined} />
      <div className="tabs" role="tablist" aria-label="وضعیت">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
            {k === "pending" && list.data?.pending ? ` (${num(list.data.pending)})` : ""}
          </button>
        ))}
      </div>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        {!list.data ? (
          <Loading />
        ) : list.data.items.length === 0 ? (
          <div className="card empty">دیدگاهی در این بخش نیست.</div>
        ) : (
          list.data.items.map((c) => (
            <article key={c.id} className="card" aria-label={`دیدگاه ${c.name}`}>
              <div className="card-head">
                <div>
                  <strong>{c.name}</strong> {c.team && <span className="badge accent">تیم آراپوش</span>} {c.parentId && <span className="badge">پاسخ</span>}
                  <div className="small muted">
                    {c.email && (
                      <code dir="ltr" style={{ marginInlineEnd: 8 }}>
                        {c.email}
                      </code>
                    )}
                    {LOCALE_NAME[c.locale]} · {ago(c.createdAt)} ·{" "}
                    <Link href={`/blog/${c.postId}`}>{c.postTitle || "مقاله"}</Link>
                  </div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {c.status !== "approved" && (
                    <button type="button" className="btn sm primary" onClick={() => moderate(c, "approved")} disabled={act.busy}>
                      تأیید
                    </button>
                  )}
                  {c.status !== "spam" && !c.team && (
                    <button type="button" className="btn sm" onClick={() => moderate(c, "spam")} disabled={act.busy}>
                      اسپم
                    </button>
                  )}
                  {c.status !== "trash" && (
                    <button type="button" className="btn sm" onClick={() => moderate(c, "trash")} disabled={act.busy}>
                      زباله‌دان
                    </button>
                  )}
                  <button type="button" className="btn sm danger" onClick={() => confirm("این دیدگاه (و پاسخ‌هایش) برای همیشه حذف شود؟") && run(() => api(`/v1/manage/blog/comments/${c.id}`, { method: "DELETE" }), "حذف شد.")} disabled={act.busy}>
                    حذف
                  </button>
                </div>
              </div>
              <div className="card-body stack">
                <p style={{ whiteSpace: "pre-line", margin: 0 }} dir="auto">
                  {c.body}
                </p>
                {!c.team && c.status !== "spam" && (
                  <form
                    className="row"
                    style={{ flexWrap: "nowrap", alignItems: "flex-end" }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = reply[c.id]?.trim();
                      if (body) run(() => api(`/v1/manage/blog/comments/${c.id}/reply`, { body: { body } }).then(() => setReply({ ...reply, [c.id]: "" })), "پاسخ منتشر شد.");
                    }}
                  >
                    <label className="f" style={{ flex: 1 }}>
                      <span>پاسخ تیم (همراه با تأیید دیدگاه منتشر می‌شود)</span>
                      <textarea rows={2} maxLength={2000} dir="auto" value={reply[c.id] ?? ""} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} />
                    </label>
                    <button className="btn sm" disabled={act.busy || !reply[c.id]?.trim()}>
                      پاسخ
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
