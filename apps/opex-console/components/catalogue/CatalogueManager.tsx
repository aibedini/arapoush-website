"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowUUpLeft, Eye, FloppyDisk, RocketLaunch } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, num } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { PreviewFrames } from "@/components/PreviewFrames";
import { ClosureModels } from "@/components/ClosureModels";
import { clean, validate, type Catalogue, type Tab } from "./model";
import { Overview, TAB_FA } from "./Overview";
import { ShapesEditor } from "./ShapesEditor";
import { ClosuresEditor } from "./ClosuresEditor";
import { ColoursEditor } from "./ColoursEditor";
import { PrintsEditor } from "./PrintsEditor";
import { StructuresEditor } from "./StructuresEditor";
import { SamplesEditor } from "./SamplesEditor";
import { ImportPanel } from "./ImportPanel";

const KEY = "product.tube.catalogue";
const TABS: Tab[] = ["overview", "shapes", "closures", "colours", "prints", "structures", "samples", "import", "models"];
type EntryView = {
  entry: { draft_revision_id: string | null; published_revision_id: string | null };
  draft: { id: string; number: number; data: Record<string, unknown>; created_at: string } | null;
};

const normalize = (d: Record<string, unknown> | undefined): Catalogue => ({ ...d, shapes: [], closures: [], structures: [], samples: [], ...(d as Partial<Catalogue>) }) as Catalogue;
const tabFromHash = (): Tab => {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  return (TABS as string[]).includes(h) ? (h as Tab) : "overview";
};

/**
 * The tube catalogue manager. Every tab edits one local copy of the catalogue draft; the bar at the
 * bottom saves it (against the draft it started from) and the header publishes the saved draft.
 * Excel import and factory 3D models write drafts on the server, so they ask for a clean copy first
 * and reload it after.
 */
export function CatalogueManager() {
  const me = useMe();
  const view = useApi<EntryView>(`/v1/manage/entries/${KEY}`);
  const act = useAction();
  const [data, setData] = useState<Catalogue | null>(null);
  const [tab, setTabState] = useState<Tab>("overview");
  const [sel, setSel] = useState<Partial<Record<Tab, string>>>({});
  const [frames, setFrames] = useState(false);
  const [note, setNote] = useState("");
  const [backup, setBackup] = useState<Catalogue | null>(null);
  const past = useRef<Catalogue[]>([]);
  const lastPush = useRef(0);
  const [undoCount, setUndoCount] = useState(0);

  const orig = useMemo(() => (view.data ? normalize(view.data.draft?.data) : null), [view.data]);
  useEffect(() => {
    if (!orig) return;
    setData(orig);
    past.current = [];
    setUndoCount(0);
  }, [orig]);
  const dirty = useMemo(() => !!data && !!orig && JSON.stringify(clean(data)) !== JSON.stringify(clean(orig)), [data, orig]);
  const issues = useMemo(() => (data ? validate(data) : []), [data]);
  const bad = issues.filter((i) => i.level === "bad").length;

  // Tabs live in the URL hash, so a link or a reload opens the same tab.
  useEffect(() => {
    setTabState(tabFromHash());
    const h = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#${t}`);
  }, []);
  const open = (t: Tab, id?: string) => {
    if (id) setSel((s) => ({ ...s, [t]: id }));
    setTab(t);
  };

  /** Every edit goes through here: one undo step per burst of typing. */
  const dataRef = useRef<Catalogue | null>(null);
  dataRef.current = data;
  const set = useCallback((fn: (c: Catalogue) => Catalogue) => {
    const cur = dataRef.current;
    if (!cur) return;
    const now = Date.now();
    if (now - lastPush.current > 700) {
      past.current = [...past.current.slice(-49), cur];
      setUndoCount(past.current.length);
    }
    lastPush.current = now;
    setData((c) => (c ? fn(c) : c));
  }, []);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    lastPush.current = 0;
    setData(prev);
    setUndoCount(past.current.length);
  };

  // Unsaved edits survive a closed tab (same key as the generic content editor).
  const backupKey = `opex:unsaved:${KEY}`;
  useEffect(() => {
    if (!view.data) return;
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const b = JSON.parse(raw) as { base: string | null; data: Catalogue };
      if (b.base === (view.data.draft?.id ?? null) && JSON.stringify(b.data) !== JSON.stringify(view.data.draft?.data ?? {})) setBackup(normalize(b.data as unknown as Record<string, unknown>));
      else localStorage.removeItem(backupKey);
    } catch {}
  }, [view.data, backupKey]);
  useEffect(() => {
    try {
      if (dirty && data) localStorage.setItem(backupKey, JSON.stringify({ base: view.data?.draft?.id ?? null, data: clean(data) }));
      else if (!dirty && !backup) localStorage.removeItem(backupKey);
    } catch {}
  }, [dirty, data, backupKey, view.data, backup]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = useCallback(
    () =>
      data &&
      act.run(async () => {
        await api(`/v1/manage/entries/${KEY}`, { method: "PUT", body: { data: clean(data), base_revision_id: view.data?.draft?.id ?? null, ...(note.trim() ? { note: note.trim() } : {}) } });
        setNote("");
        localStorage.removeItem(backupKey);
        view.reload();
      }, "پیش‌نویس ذخیره شد. برای نمایش روی سایت، منتشر کنید."),
    [act, data, note, view, backupKey],
  );
  // Ctrl/⌘+S saves.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !act.busy && canWrite(me)) void save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dirty, act.busy, me, save]);
  const publish = () =>
    act.run(async () => {
      await api(`/v1/manage/entries/${KEY}/publish`, { body: {} });
      view.reload();
    }, "منتشر شد؛ صفحهٔ تیوب تا چند ثانیهٔ دیگر به‌روز می‌شود.");
  const discard = () => {
    if (!confirm("همهٔ تغییرات ذخیره‌نشده کنار گذاشته شود؟")) return;
    localStorage.removeItem(backupKey);
    if (orig) setData(orig);
    past.current = [];
    setUndoCount(0);
  };

  if (view.error) return <ErrorNote error={view.error} />;
  if (!view.data || !data) return <Loading rows={10} />;
  const writable = canWrite(me);
  const disabled = !writable || act.busy;
  const unpublished = view.data.entry.draft_revision_id !== view.data.entry.published_revision_id;
  const counts: Partial<Record<Tab, number>> = { shapes: data.shapes.length, closures: data.closures.length, prints: data.prints?.length ?? 0, structures: data.structures.length, samples: data.samples.length };
  const props = { cat: data, set, disabled };
  const pick = (t: Tab) => ({ selected: sel[t] ?? "", onSelect: (id: string) => setSel((s) => ({ ...s, [t]: id })) });
  const tabIssues = (t: Tab) => issues.filter((i) => i.tab === t);

  return (
    <div className="cm">
      <PageHead title="کاتالوگ تیوب" sub="شکل‌ها، سایزها، درب‌ها، رنگ‌ها، چاپ، ساختار دیواره و نمونه‌های پیکربندی تیوب؛ هر چیزی اینجا یا یک‌جا از اکسل.">
        {dirty ? <span className="badge warn">تغییرات ذخیره‌نشده</span> : unpublished ? <span className="badge warn">پیش‌نویس منتشرنشده</span> : <span className="badge ok">منتشرشده و به‌روز</span>}
        <button type="button" className="btn" onClick={() => setFrames(true)} disabled={dirty} title={dirty ? "اول ذخیره کنید" : undefined}>
          <Eye size={18} aria-hidden /> پیش‌نمایش روی سایت
        </button>
        {writable && (
          <button type="button" className="btn primary" onClick={publish} disabled={dirty || !unpublished || act.busy || bad > 0} title={bad > 0 ? "اول خطاها را رفع کنید" : dirty ? "اول ذخیره کنید" : undefined}>
            <RocketLaunch size={18} aria-hidden /> انتشار
          </button>
        )}
      </PageHead>
      {writable && (dirty || bad > 0 || !unpublished) && (
        <p className="small muted cm-why" role="status">
          {dirty ? "پیش‌نمایش و انتشار پس از ذخیرهٔ پیش‌نویس فعال می‌شوند." : bad > 0 ? `${num(bad)} خطا باید پیش از انتشار رفع شود (زبانهٔ نمای کلی).` : "پیش‌نویس با نسخهٔ منتشرشده یکی است؛ چیزی برای انتشار نیست."}
        </p>
      )}

      {backup && (
        <div className="note warn row" role="status" style={{ marginBlockEnd: 12 }}>
          <span style={{ flex: 1 }}>تغییرات ذخیره‌نشده‌ای از جلسهٔ قبل در این مرورگر مانده است.</span>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              set(() => backup);
              setBackup(null);
            }}
          >
            بازیابی
          </button>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              localStorage.removeItem(backupKey);
              setBackup(null);
            }}
          >
            کنار گذاشتن
          </button>
        </div>
      )}
      {act.done && (
        <div className="note ok" role="status" style={{ marginBlockEnd: 12 }}>
          {act.done}
        </div>
      )}
      <ErrorNote error={act.error} />

      <div className="tabs cm-tabs" role="tablist" aria-label="بخش‌های کاتالوگ">
        {TABS.map((t) => {
          const n = tabIssues(t);
          return (
            <button
              key={t}
              id={`cm-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={t === tab}
              aria-controls="cm-panel"
              tabIndex={t === tab ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                const i = TABS.indexOf(t);
                // RTL: the arrow pointing away from the start goes forward.
                const step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
                if (!step) return;
                const next = TABS[(i + step + TABS.length) % TABS.length]!;
                setTab(next);
                document.getElementById(`cm-tab-${next}`)?.focus();
              }}
            >
              {TAB_FA[t]}
              {counts[t] !== undefined && <span className="cm-tab-n">{num(counts[t]!)}</span>}
              {n.length > 0 && (
                <span className={`cm-tab-issue ${n.some((i) => i.level === "bad") ? "bad" : "warn"}`}>
                  <span className="sr-only">، </span>
                  {num(n.length)}
                  <span className="sr-only"> مورد قابل بررسی</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id="cm-panel" role="tabpanel" aria-labelledby={`cm-tab-${tab}`} className="cm-panel">
        {tab === "overview" && <Overview cat={data} issues={issues} onOpen={open} />}
        {tab === "shapes" && <ShapesEditor {...props} issues={tabIssues("shapes")} {...pick("shapes")} />}
        {tab === "closures" && <ClosuresEditor {...props} issues={tabIssues("closures")} {...pick("closures")} onTab={setTab} />}
        {tab === "colours" && <ColoursEditor {...props} issues={tabIssues("colours")} />}
        {tab === "prints" && <PrintsEditor {...props} issues={tabIssues("prints")} {...pick("prints")} />}
        {tab === "structures" && <StructuresEditor {...props} issues={tabIssues("structures")} {...pick("structures")} />}
        {tab === "samples" && <SamplesEditor {...props} issues={tabIssues("samples")} {...pick("samples")} />}
        {tab === "import" && <ImportPanel dirty={dirty} onApplied={view.reload} />}
        {tab === "models" && (
          <div className="stack">
            {dirty && (
              <p className="note warn" role="status">
                تغییرات ذخیره‌نشده دارید. تأیید یک مدل پیش‌نویس تازه می‌سازد؛ اول ذخیره کنید.
              </p>
            )}
            <div className="card">
              <div className="card-head">
                <h2>مدل‌های سه‌بعدی درب‌ها (STEP / GLB)</h2>
              </div>
              <div className="card-body">
                <ClosureModels onApproved={view.reload} />
              </div>
            </div>
          </div>
        )}
      </div>

      {writable && (dirty || undoCount > 0) && (
        <div className="savebar cm-savebar" role="region" aria-label="ذخیرهٔ پیش‌نویس">
          <span>
            {dirty ? <strong>تغییرات ذخیره‌نشده</strong> : "ذخیره شد"}
            {bad > 0 && <span className="badge bad" style={{ marginInlineStart: 8 }}>{num(bad)} خطا</span>}
            <span className="small muted" style={{ marginInlineStart: 8 }}>
              پایهٔ ویرایش: پیش‌نویس {num(view.data.draft?.number ?? 0)}
              {view.data.draft && ` · ${ago(view.data.draft.created_at)}`}
            </span>
          </span>
          <label className="sr-only" htmlFor="cm-note">
            یادداشت این نسخه
          </label>
          <input id="cm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت نسخه (اختیاری)" className="cm-note" disabled={!dirty} />
          <button type="button" className="btn ghost" onClick={undo} disabled={!undoCount || act.busy}>
            <ArrowUUpLeft size={18} aria-hidden /> برگرداندن
          </button>
          <button type="button" className="btn ghost" onClick={discard} disabled={!dirty || act.busy}>
            <ArrowCounterClockwise size={18} aria-hidden /> رها کردن همه
          </button>
          <button type="button" className="btn primary" onClick={() => void save()} disabled={!dirty || act.busy} aria-keyshortcuts="Control+S">
            <FloppyDisk size={18} aria-hidden /> {act.busy ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
          </button>
        </div>
      )}

      <p className="small muted cm-foot">
        نسخه‌ها، مقایسه و بازگشت به نسخهٔ قبل: <Link href={`/content/${KEY}`}>صفحهٔ محتوای کاتالوگ</Link>
      </p>
      <PreviewFrames open={frames} onClose={() => setFrames(false)} type={KEY} />
    </div>
  );
}
