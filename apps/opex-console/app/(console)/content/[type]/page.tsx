"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { GroupField } from "@arapoush/schema";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, num, when } from "@/lib/fa";
import { FieldEditor } from "@/components/FieldEditor";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";
import { CapPositions } from "@/components/CapPositions";
import { RenderPanel } from "@/components/RenderPanel";
import { PreviewFrames } from "@/components/PreviewFrames";

type Change = { op: string; path: string; old?: unknown; new?: unknown };
type EntryView = {
  entry: { id: string; type_key: string; draft_revision_id: string | null; published_revision_id: string | null; scheduled_at: string | null };
  schema: GroupField;
  draft: { id: string; number: number; data: Record<string, unknown>; created_at: string } | null;
  publishedData: unknown;
  changesSincePublish: Change[];
};
type Rev = { id: string; number: number; created_at: string; note: string | null; author: string | null; author_kind: string | null; via_cr_id: string | null; is_draft: boolean; is_published: boolean };

const short = (v: unknown) => {
  if (v === undefined || v === null) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
};

function Changes({ list }: { list: Change[] }) {
  if (!list.length) return <p className="muted small">تفاوتی نیست.</p>;
  return (
    <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {list.slice(0, 200).map((c, i) => (
        <li key={c.path + i} className="small">
          <code>{c.path}</code>
          <div className="diff-old">{short(c.old)}</div>
          <div className="diff-new">{short(c.new)}</div>
        </li>
      ))}
    </ul>
  );
}

export default function EditEntry() {
  const { type } = useParams<{ type: string }>();
  const key = decodeURIComponent(type);
  const me = useMe();
  const view = useApi<EntryView>(`/v1/manage/entries/${encodeURIComponent(key)}`);
  const types = useApi<{ key: string; label: string }[]>("/v1/manage/types");
  const revs = useApi<Rev[]>(`/v1/manage/entries/${encodeURIComponent(key)}/revisions`);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState("");
  const [diff, setDiff] = useState<{ title: string; list: Change[] } | null>(null);
  const [schedule, setSchedule] = useState("");
  const [frames, setFrames] = useState(false);
  const act = useAction();

  useEffect(() => {
    if (view.data) setData(view.data.draft?.data ?? {});
  }, [view.data]);
  const orig = useMemo(() => view.data?.draft?.data ?? {}, [view.data]);
  const dirty = useMemo(() => !!data && JSON.stringify(data) !== JSON.stringify(orig), [data, orig]);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const refresh = () => {
    view.reload();
    revs.reload();
  };
  const save = () =>
    act.run(async () => {
      await api(`/v1/manage/entries/${encodeURIComponent(key)}`, { method: "PUT", body: { data, base_revision_id: view.data?.draft?.id ?? null, ...(note ? { note } : {}) } });
      setNote("");
      refresh();
    }, "پیش‌نویس ذخیره شد. برای نمایش روی سایت، منتشر کنید.");
  const publish = () =>
    act.run(async () => {
      await api(`/v1/manage/entries/${encodeURIComponent(key)}/publish`, { body: {} });
      refresh();
    }, "منتشر شد؛ سایت تا چند ثانیهٔ دیگر به‌روز می‌شود.");
  const rollback = (r: Rev) =>
    confirm(`نسخهٔ ${r.number} دوباره منتشر شود؟`) &&
    act.run(async () => {
      await api(`/v1/manage/entries/${encodeURIComponent(key)}/rollback`, { body: { revision_id: r.id } });
      refresh();
    }, `نسخهٔ ${r.number} دوباره منتشر شد.`);
  const doSchedule = (at: string | null) =>
    act.run(async () => {
      await api(`/v1/manage/entries/${encodeURIComponent(key)}/schedule`, { body: { at } });
      setSchedule("");
      refresh();
    }, at ? "انتشار زمان‌بندی شد." : "زمان‌بندی لغو شد.");
  const compare = async (r: Rev) => {
    if (!view.data?.draft) return;
    const list = await act.run(() => api<Change[]>(`/v1/manage/diff?from=${r.id}&to=${view.data!.draft!.id}`));
    if (list) setDiff({ title: `تفاوت نسخهٔ ${r.number} با پیش‌نویس فعلی`, list });
  };

  if (view.error) return <ErrorNote error={view.error} />;
  if (!view.data || !data) return <Loading rows={10} />;
  const v = view.data;
  const writable = canWrite(me);
  const unpublished = v.entry.draft_revision_id !== v.entry.published_revision_id;

  return (
    <>
      <PageHead title={types.data?.find((t) => t.key === key)?.label ?? key} sub={key}>
        <Link className="btn" href="/content">
          بازگشت
        </Link>
      </PageHead>
      <div className="editor">
        <div className="stack">
        {key === "product.effervescent.page" && (
          <>
            <RenderPanel canRender={me?.role === "super_admin"} onDone={refresh} />
            <CapPositions data={data} orig={orig} onChange={(d) => setData(d)} canEdit={me?.role === "super_admin"} />
          </>
        )}
        <div className="card">
          <div className="card-body" style={{ paddingBlock: 6 }}>
            {Object.entries(v.schema.fields).map(([k, f]) => (
              <FieldEditor key={k} field={f} name={k} path={`/${k}`} value={data[k]} orig={orig[k]} onChange={(x) => setData({ ...data, [k]: x })} ctx={{ canEdit: writable, superAdmin: me?.role === "super_admin" }} />
            ))}
          </div>
        </div>
        </div>
        <aside className="aside">
          <section className="card" aria-label="ذخیره و انتشار">
            <div className="card-body stack">
              <div className="row">
                {dirty ? <span className="badge warn">تغییرات ذخیره‌نشده</span> : unpublished ? <span className="badge warn">پیش‌نویس منتشرنشده</span> : <span className="badge ok">منتشرشده و به‌روز</span>}
                {v.entry.scheduled_at && <span className="badge accent">انتشار: {when(v.entry.scheduled_at)}</span>}
              </div>
              <ErrorNote error={act.error} />
              {act.done && (
                <div className="note ok" role="status">
                  {act.done}
                </div>
              )}
              {writable && (
                <>
                  <label className="f">
                    <span>یادداشت این نسخه (اختیاری)</span>
                    <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <div className="row">
                    <button type="button" className="btn primary" disabled={!dirty || act.busy} onClick={save}>
                      ذخیرهٔ پیش‌نویس
                    </button>
                    <button type="button" className="btn" disabled={dirty || !unpublished || act.busy} onClick={publish}>
                      انتشار
                    </button>
                    {dirty && (
                      <button type="button" className="btn ghost" onClick={() => setData(orig)}>
                        دور ریختن تغییرات
                      </button>
                    )}
                  </div>
                  {unpublished && !dirty && (
                    <div className="row">
                      <label className="sr-only" htmlFor="sched">
                        زمان انتشار
                      </label>
                      <input id="sched" type="datetime-local" dir="ltr" style={{ flex: 1 }} value={schedule} onChange={(e) => setSchedule(e.target.value)} />
                      <button type="button" className="btn sm" disabled={!schedule || act.busy} onClick={() => doSchedule(new Date(schedule).toISOString())}>
                        زمان‌بندی
                      </button>
                      {v.entry.scheduled_at && (
                        <button type="button" className="btn sm ghost" onClick={() => doSchedule(null)}>
                          لغو زمان‌بندی
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              <div className="row">
                <button type="button" className="btn sm" disabled={dirty} onClick={() => setFrames(true)} title={dirty ? "اول ذخیره کنید" : undefined}>
                  پیش‌نمایش روی سایت (موبایل، تبلت، دسکتاپ)
                </button>
              </div>
              {v.changesSincePublish.length > 0 && (
                <button type="button" className="btn sm ghost" onClick={() => setDiff({ title: "تغییرات از آخرین انتشار", list: v.changesSincePublish })}>
                  {num(v.changesSincePublish.length)} تغییر نسبت به نسخهٔ منتشرشده
                </button>
              )}
            </div>
          </section>
          <section className="card" aria-labelledby="revs-h">
            <div className="card-head">
              <h2 id="revs-h">نسخه‌ها</h2>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxBlockSize: 420, overflow: "auto" }}>
              {revs.data?.map((r) => (
                <li key={r.id} style={{ padding: "10px 18px", borderBlockEnd: "1px solid var(--line)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>نسخهٔ {num(r.number)}</b>
                    <span className="row">
                      {r.is_published && <span className="badge ok">منتشرشده</span>}
                      {r.is_draft && <span className="badge">پیش‌نویس</span>}
                      {r.via_cr_id && <span className="badge accent">آراسی‌ام‌اس</span>}
                    </span>
                  </div>
                  <div className="small muted">
                    {r.author ?? "سیستم"} · {ago(r.created_at)}
                  </div>
                  {r.note && <div className="small">{r.note}</div>}
                  {!r.is_draft && (
                    <div className="row" style={{ marginBlockStart: 4 }}>
                      <button type="button" className="btn sm ghost" onClick={() => compare(r)}>
                        مقایسه
                      </button>
                      {writable && !r.is_published && (
                        <button type="button" className="btn sm ghost" onClick={() => rollback(r)}>
                          بازگرداندن
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <PreviewFrames open={frames} onClose={() => setFrames(false)} type={key} />
      <Dialog open={!!diff} onClose={() => setDiff(null)} title={diff?.title ?? ""} wide>
        {diff && <Changes list={diff.list} />}
      </Dialog>
    </>
  );
}
