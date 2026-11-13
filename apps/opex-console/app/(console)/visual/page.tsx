"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, ArrowDown, ArrowUp, Copy, DesktopTower, DeviceMobile, DeviceTablet, DotsSixVertical, Eye, EyeSlash, Plus, Question, Rows, TextAa, Image as ImageIcon, Megaphone, ListChecks, ArrowsVertical, Trash, UploadSimple, PaintBrush } from "@phosphor-icons/react";
import { BLOCK_FIELDS, BLOCK_KINDS, BLOCK_PROPS, getAt, isBlockKind, newBlock, PAGE_LAYOUTS, SECTION_ENTRY, setAt, type BlockKind, type GroupField, type LayoutSection } from "@arapoush/schema";
import { api, ApiError } from "@/lib/api";
import { canWrite, useMe } from "@/lib/hooks";
import { num } from "@/lib/fa";
import { FieldEditor } from "@/components/FieldEditor";
import { MediaLibrary, assetUrl, type Asset } from "@/components/MediaLibrary";
import { Dialog, ErrorNote, Loading } from "@/components/ui";

type Doc = { schema: GroupField; data: Record<string, unknown>; rev: string | null; published: string | null; draft: string | null };
/** `layout`: pages whose sections can be ordered, hidden, restyled and mixed with blocks (PAGE_LAYOUTS). */
type PageDef = { key: string; label: string; type: string; entries: string[]; layout?: keyof typeof PAGE_LAYOUTS };

const PAGES: PageDef[] = [
  { key: "home", label: "صفحهٔ اصلی", type: "page.home.layout", entries: ["page.home.layout", ...Object.values(SECTION_ENTRY), "global.site"], layout: "home" },
  { key: "tube", label: "تیوب چندلایه", type: "product.tube.page", entries: ["product.tube.page", "product.tube.catalogue", "global.site"], layout: "tube" },
  { key: "eff", label: "تیوب قرص جوشان", type: "product.effervescent.page", entries: ["product.effervescent.page", "global.site"] },
  { key: "printing", label: "چاپ", type: "page.printing", entries: ["page.printing", "global.site"] },
  { key: "about", label: "درباره آراپوش", type: "page.about", entries: ["page.about", "global.site"] },
  { key: "applications", label: "کاربردها", type: "page.applications", entries: ["page.applications", "product.tube.catalogue", "page.printing", "global.site"] },
];
const STYLE_LABEL: Record<string, string> = { media: "تصویر تمام‌عرض", compact: "کوتاه", viewerStart: "نمایشگر اول", viewerEnd: "گزینه‌ها اول", grid: "شبکه", rail: "ردیف لغزان", split: "کنار هم", stacked: "زیر هم" };
const BLOCKS: Record<BlockKind, { label: string; text: string; icon: typeof Rows }> = {
  richText: { label: "متن", text: "عنوان و چند پاراگراف", icon: TextAa },
  imageText: { label: "تصویر و متن", text: "تصویر کنار متن، با دکمهٔ دلخواه", icon: ImageIcon },
  cta: { label: "دعوت به اقدام", text: "یک پیام کوتاه با دکمه", icon: Megaphone },
  faq: { label: "پرسش‌های پرتکرار", text: "پرسش و پاسخ تاشو (برای گوگل هم)", icon: Question },
  form: { label: "فرم", text: "یکی از فرم‌های OPEX", icon: ListChecks },
  spacer: { label: "فاصله", text: "فضای خالی بین بخش‌ها", icon: ArrowsVertical },
};
const WIDTHS = [
  { w: 390, icon: DeviceMobile, label: "موبایل" },
  { w: 768, icon: DeviceTablet, label: "تبلت" },
  { w: 1440, icon: DesktopTower, label: "دسکتاپ" },
] as const;
const sameDoc = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Visual editor (P12): the real page in a frame. Click text to edit it in place, click an image to
 * replace it, pick a section to edit its fields; on the home page, add, order, hide and remove
 * sections. Changes save as drafts on their own; "Publish" makes them live.
 */
export default function Visual() {
  const me = useMe();
  const edit = canWrite(me);
  const [page, setPage] = useState<PageDef>(PAGES[0]!);
  const [locale, setLocale] = useState<"fa" | "en" | "tr">("fa");
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("page");
    const p = PAGES.find((x) => x.key === k);
    if (p) setPage(p);
  }, []);
  const [width, setWidth] = useState<number>(1440);
  const [docs, setDocs] = useState<Record<string, Doc> | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selected, setSelected] = useState<{ section: string | null; entry: string } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ entry: string; path: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [past, setPast] = useState<Record<string, Doc>[]>([]);
  const [future, setFuture] = useState<Record<string, Doc>[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const siteOrigin = useMemo(() => (url ? new URL(url).origin : ""), [url]);

  // Load every entry of the page (drafts) and a signed edit-mode preview link.
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    setError(null);
    try {
      const list = await Promise.all(page.entries.map((k) => api<{ entry: { draft_revision_id: string | null; published_revision_id: string | null }; schema: GroupField; draft: { id: string; data: Record<string, unknown> } | null }>(`/v1/manage/entries/${encodeURIComponent(k)}`).then((v) => [k, { schema: v.schema, data: v.draft?.data ?? {}, rev: v.draft?.id ?? null, published: v.entry.published_revision_id, draft: v.entry.draft_revision_id }] as const)));
      if (id !== loadId.current) return;
      setDocs(Object.fromEntries(list));
      const link = await api<{ url: string }>("/v1/manage/preview", { body: { type: page.type, locale } });
      const u = new URL(link.url);
      u.searchParams.set("edit", "1");
      if (id === loadId.current) setUrl(u.toString());
    } catch (e) {
      if (id === loadId.current) setError(e as ApiError);
    }
  }, [page, locale]);
  useEffect(() => {
    setDocs(null);
    setSelected(null);
    setPast([]);
    setFuture([]);
    load();
  }, [load]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 24) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const send = useCallback((m: Record<string, unknown>) => siteOrigin && frame.current?.contentWindow?.postMessage({ source: "opex-console", ...m }, siteOrigin), [siteOrigin]);
  const sendContent = useCallback(() => docs && send({ type: "content", locale, entries: Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, d.data])) }), [docs, locale, send]);
  const reloadFrame = () => setNonce((n) => n + 1);

  // Saving: text edits as field operations (PATCH), structure as whole drafts (PUT).
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const pending = useRef<Record<string, { path: string; value: unknown }[]>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    const work = pending.current;
    pending.current = {};
    if (!Object.keys(work).length) return;
    setStatus("saving");
    try {
      for (const [key, ops] of Object.entries(work)) {
        const d = docsRef.current![key]!;
        const r = await api<{ revision: { id: string } }>(`/v1/manage/entries/${encodeURIComponent(key)}`, { method: "PATCH", body: { base_revision_id: d.rev, ops } });
        setDocs((s) => (s ? { ...s, [key]: { ...s[key]!, rev: r.revision.id, draft: r.revision.id } } : s));
        docsRef.current = docsRef.current && { ...docsRef.current, [key]: { ...docsRef.current[key]!, rev: r.revision.id, draft: r.revision.id } };
      }
      setStatus("saved");
    } catch (e) {
      setError(e as ApiError);
      setStatus("error");
    }
  }, []);
  const queue = (key: string, path: string, value: unknown) => {
    pending.current[key] = [...(pending.current[key] ?? []).filter((o) => o.path !== path), { path, value }];
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };
  const saveWhole = async (key: string, data: Record<string, unknown>, reload = true) => {
    await flush();
    setStatus("saving");
    try {
      const d = docsRef.current![key]!;
      const r = await api<{ revision: { id: string } }>(`/v1/manage/entries/${encodeURIComponent(key)}`, { method: "PUT", body: { data, base_revision_id: d.rev } });
      setDocs((s) => (s ? { ...s, [key]: { ...s[key]!, data, rev: r.revision.id, draft: r.revision.id } } : s));
      setStatus("saved");
      if (reload) reloadFrame();
    } catch (e) {
      setError(e as ApiError);
      setStatus("error");
    }
  };
  // One undo step per field being typed into (the frame reports every keystroke).
  const lastText = useRef<string | null>(null);
  const snapshot = () => {
    if (!docs) return;
    setPast((p) => [...p.slice(-49), docs]);
    setFuture([]);
  };
  const change = (key: string, data: Record<string, unknown>, how: "text" | "whole", path?: string, value?: unknown) => {
    if (docs && sameDoc(docs[key]?.data, data)) return;
    const step = how === "text" ? `${key}${path}` : null;
    if (!step || step !== lastText.current) snapshot();
    lastText.current = step;
    setDocs((s) => (s ? { ...s, [key]: { ...s[key]!, data } } : s));
    if (how === "text") queue(key, path!, value);
    else saveWhole(key, data);
  };
  // Undo / redo restore whole entries (saved as drafts).
  const restore = async (target: Record<string, Doc>, from: Record<string, Doc>) => {
    for (const k of Object.keys(target)) if (!sameDoc(target[k]!.data, from[k]?.data)) await saveWhole(k, target[k]!.data, false);
    setDocs((s) => (s ? Object.fromEntries(Object.entries(s).map(([k, d]) => [k, { ...d, data: target[k]?.data ?? d.data }])) : s));
    reloadFrame();
  };
  const undo = () => {
    lastText.current = null;
    const prev = past[past.length - 1];
    if (!prev || !docs) return;
    setPast(past.slice(0, -1));
    setFuture([docs, ...future]);
    restore(prev, docs);
  };
  const redo = () => {
    const next = future[0];
    if (!next || !docs) return;
    setFuture(future.slice(1));
    setPast([...past, docs]);
    restore(next, docs);
  };

  // Messages from the page in the frame.
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== siteOrigin || e.data?.source !== "opex-site") return;
      const m = e.data as { type: string; entry?: string; path?: string; value?: string; section?: string | null };
      if (m.type === "ready") sendContent();
      else if (m.type === "select" && m.entry) setSelected({ section: m.section ?? null, entry: m.entry });
      else if (m.type === "edit" && m.entry && m.path !== undefined && docs?.[m.entry] && edit) {
        try {
          change(m.entry, setAt(docs[m.entry]!.data, m.path, m.value), "text", m.path, m.value);
        } catch {
          /* path outside the draft shape: ignore */
        }
      } else if (m.type === "pick-image" && m.entry && m.path && edit) setPicking({ entry: m.entry, path: m.path === "/" ? "" : m.path });
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const L = page.layout ? PAGE_LAYOUTS[page.layout] : null;
  const layout = L ? docs?.[L.entry] : undefined;
  const sections = ((L && layout ? getAt(layout.data, L.path) : undefined) as LayoutSection[] | undefined) ?? [];
  const setSections = (next: LayoutSection[]) => L && layout && change(L.entry, setAt(layout.data, L.path, next), "whole");
  const sectionDef = (type: string) => L?.sections[type];
  const move = (i: number, j: number) => {
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    const [it] = next.splice(i, 1);
    next.splice(j, 0, it!);
    setSections(next);
  };
  const addBlock = (kind: BlockKind, at: number) => {
    let n = 1;
    while (sections.some((s) => s.id === `${kind}-${n}`)) n++;
    const next = [...sections];
    next.splice(at, 0, newBlock(kind, `${kind}-${n}`));
    setSections(next);
    setSelected({ section: `${kind}-${n}`, entry: L!.entry });
    setAdding(null);
  };
  const [drag, setDrag] = useState<number | null>(null);

  const unpublished = docs ? Object.entries(docs).filter(([, d]) => d.draft && d.draft !== d.published).map(([k]) => k) : [];
  const publish = async () => {
    await flush();
    setStatus("saving");
    try {
      for (const k of unpublished) await api(`/v1/manage/entries/${encodeURIComponent(k)}/publish`, { body: {} });
      setDocs((s) => (s ? Object.fromEntries(Object.entries(s).map(([k, d]) => [k, unpublished.includes(k) ? { ...d, published: d.draft } : d])) : s));
      setStatus("saved");
    } catch (e) {
      setError(e as ApiError);
      setStatus("error");
    }
  };

  const pickImage = async (a: Asset) => {
    if (!picking || !docs) return;
    const d = docs[picking.entry]!;
    const p = picking.path || "/";
    const old = getAt(d.data, p);
    const value = typeof old === "string" ? assetUrl(a) : { ...(old as object), src: assetUrl(a), width: a.width ?? undefined, height: a.height ?? undefined };
    setPicking(null);
    change(picking.entry, setAt(d.data, p, value), "whole");
  };

  // Inspector: the selected built-in section's entry, or the selected block's own fields.
  const sel = selected?.section ? sections.findIndex((s) => s.id === selected.section) : -1;
  const selSection = sel >= 0 ? sections[sel] : null;
  const inspector = (() => {
    if (!docs || !selected) return null;
    if (selSection && isBlockKind(selSection.type)) {
      const kind = selSection.type;
      const schema: GroupField = { kind: "group", fields: Object.fromEntries(BLOCK_FIELDS[kind].map((k) => [k, BLOCK_PROPS.fields[k]!])) };
      const props = (selSection.props ?? {}) as Record<string, unknown>;
      return { title: BLOCKS[kind].label, schema, value: props, onChange: (v: Record<string, unknown>) => setSections(sections.map((s, i) => (i === sel ? { ...s, props: v } : s))) };
    }
    const def = selSection ? sectionDef(selSection.type) : undefined;
    const key = def ? def.entry : selected.entry;
    const d = key ? docs[key] : undefined;
    if (!d || !key) return null;
    return { title: def?.label ?? (key === "global.site" ? "سربرگ و پانویس" : "محتوای صفحه"), schema: d.schema, value: d.data, onChange: (v: Record<string, unknown>) => change(key, v, "whole") };
  })();
  // Inspector edits save after a pause (typing in a field is many changes).
  const [draftInspector, setDraftInspector] = useState<Record<string, unknown> | null>(null);
  useEffect(() => setDraftInspector(null), [selected?.section, selected?.entry]);
  useEffect(() => {
    if (!draftInspector || !inspector) return;
    const t = setTimeout(() => {
      inspector.onChange(draftInspector);
      setDraftInspector(null);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftInspector]);

  if (error && !docs) return <ErrorNote error={error} />;
  return (
    <div className="visual">
      <header className="vis-bar">
        <h1 className="row" style={{ gap: 8 }}>
          <PaintBrush size={20} aria-hidden /> ویرایشگر بصری
        </h1>
        <label className="sr-only" htmlFor="vis-page">
          صفحه
        </label>
        <select id="vis-page" value={page.key} onChange={(e) => setPage(PAGES.find((p) => p.key === e.target.value)!)}>
          {PAGES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="loc-tabs" role="tablist" aria-label="زبان">
          {(["fa", "en", "tr"] as const).map((l) => (
            <button key={l} type="button" role="tab" aria-selected={locale === l} onClick={() => setLocale(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </span>
        <span className="seg" role="group" aria-label="اندازهٔ صفحه">
          {WIDTHS.map((x) => (
            <button key={x.w} type="button" aria-pressed={width === x.w} onClick={() => setWidth(x.w)} aria-label={x.label} title={x.label}>
              <x.icon size={18} aria-hidden />
            </button>
          ))}
        </span>
        <span className="seg" role="group" aria-label="واگرد">
          <button type="button" onClick={undo} disabled={!past.length} aria-label="واگرد (Ctrl+Z)" title="واگرد (Ctrl+Z)">
            <ArrowCounterClockwise size={18} aria-hidden />
          </button>
          <button type="button" onClick={redo} disabled={!future.length} aria-label="ازنو (Ctrl+Y)" title="ازنو (Ctrl+Y)">
            <ArrowClockwise size={18} aria-hidden />
          </button>
        </span>
        <span className="vis-status small" role="status" aria-live="polite">
          {status === "saving" ? "در حال ذخیره…" : status === "saved" ? "پیش‌نویس ذخیره شد" : status === "error" ? "ذخیره نشد" : ""}
        </span>
        {edit && (
          <button type="button" className="btn primary" disabled={!unpublished.length || status === "saving"} onClick={publish} style={{ marginInlineStart: "auto" }}>
            <UploadSimple size={16} aria-hidden /> انتشار{unpublished.length ? ` (${num(unpublished.length)})` : ""}
          </button>
        )}
      </header>
      {error && docs && <ErrorNote error={error} />}

      <div className="vis-body">
        <aside className="vis-panel" aria-label="بخش‌های صفحه">
          {L ? (
            <>
              <h2 className="small muted">بخش‌ها</h2>
              <ol className="vis-sections">
                {sections.map((s, i) => {
                  const block = isBlockKind(s.type);
                  const Icon = block ? BLOCKS[s.type as BlockKind].icon : Rows;
                  return (
                    <li
                      key={s.id}
                      aria-current={selected?.section === s.id ? "true" : undefined}
                      data-off={!s.enabled}
                      draggable={edit}
                      onDragStart={() => setDrag(i)}
                      onDragOver={(e) => drag !== null && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag !== null) move(drag, i);
                        setDrag(null);
                      }}
                    >
                      <span className="grip" aria-hidden>
                        <DotsSixVertical size={16} />
                      </span>
                      <button
                        type="button"
                        className="vs-main"
                        onClick={() => {
                          setSelected({ section: s.id, entry: block ? L.entry : (sectionDef(s.type)?.entry ?? L.entry) });
                          send({ type: "select", section: s.id });
                        }}
                      >
                        <Icon size={16} aria-hidden />
                        <span>{block ? (s.props?.title?.fa || BLOCKS[s.type as BlockKind].label) : (sectionDef(s.type)?.label ?? s.type)}</span>
                      </button>
                      {edit && (
                        <span className="vs-tools">
                          <button type="button" className="btn ghost icon-btn sm" aria-label={s.enabled ? "پنهان کردن" : "نمایش"} onClick={() => setSections(sections.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))}>
                            {s.enabled ? <Eye size={15} aria-hidden /> : <EyeSlash size={15} aria-hidden />}
                          </button>
                          <button type="button" className="btn ghost icon-btn sm" aria-label="بالا" disabled={i === 0} onClick={() => move(i, i - 1)}>
                            <ArrowUp size={15} aria-hidden />
                          </button>
                          <button type="button" className="btn ghost icon-btn sm" aria-label="پایین" disabled={i === sections.length - 1} onClick={() => move(i, i + 1)}>
                            <ArrowDown size={15} aria-hidden />
                          </button>
                          {block && (
                            <>
                              <button
                                type="button"
                                className="btn ghost icon-btn sm"
                                aria-label="رونوشت"
                                onClick={() => {
                                  let n = 1;
                                  while (sections.some((x) => x.id === `${s.type}-${n}`)) n++;
                                  setSections([...sections.slice(0, i + 1), { ...structuredClone(s), id: `${s.type}-${n}` }, ...sections.slice(i + 1)]);
                                }}
                              >
                                <Copy size={15} aria-hidden />
                              </button>
                              <button type="button" className="btn ghost icon-btn sm danger" aria-label="حذف" onClick={() => confirm("این بخش حذف شود؟ (با واگرد برمی‌گردد)") && setSections(sections.filter((_, j) => j !== i))}>
                                <Trash size={15} aria-hidden />
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {edit && (
                <button type="button" className="btn" onClick={() => setAdding(sel >= 0 ? sel + 1 : sections.length)}>
                  <Plus size={16} aria-hidden /> افزودن بخش{sel >= 0 ? " بعد از انتخاب‌شده" : ""}
                </button>
              )}
            </>
          ) : (
            <p className="small muted">چیدمان این صفحه ثابت است؛ متن‌ها و تصویرها را روی خود صفحه ویرایش کنید.</p>
          )}
          <div className="vis-help small muted">
            <p>روی هر متن کلیک کنید و بنویسید؛ Enter یا کلیک بیرون، ذخیره می‌کند و Esc لغو.</p>
            <p>روی تصویر کلیک کنید تا جایگزین شود.</p>
            <p>پیوندها در این حالت باز نمی‌شوند (Ctrl + کلیک باز می‌کند).</p>
          </div>
        </aside>

        <div className="vis-stage" ref={box}>
          {!url || !docs ? (
            <Loading rows={8} />
          ) : (
            <div className="vis-device" style={{ inlineSize: width * scale, blockSize: `calc((100dvh - 120px))` }} dir="ltr">
              <iframe
                key={`${url}-${nonce}`}
                ref={frame}
                title="صفحهٔ در حال ویرایش"
                src={url}
                style={{ width, height: `calc((100dvh - 120px) / ${scale})`, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                onLoad={() => setTimeout(sendContent, 300)}
              />
            </div>
          )}
        </div>

        <aside className="vis-inspector" aria-label="ویرایش بخش">
          {!inspector ? (
            <div className="empty small">
              <p>یک بخش را روی صفحه یا در فهرست انتخاب کنید.</p>
              <p>برچسب آبی بالای هر بخش را بزنید تا فیلدهایش اینجا بیاید.</p>
            </div>
          ) : (
            <>
              <h2>{inspector.title}</h2>
              {selSection && (sectionDef(selSection.type)?.styles.length ?? 0) > 0 && (
                <label className="stack" style={{ gap: 4, marginBlockEnd: 12 }}>
                  <span className="small" style={{ fontWeight: 600 }}>
                    سبک نمایش این بخش
                  </span>
                  <select
                    value={selSection.style ?? sectionDef(selSection.type)!.styles[0]}
                    disabled={!edit}
                    onChange={(e) => setSections(sections.map((x) => (x.id === selSection.id ? { ...x, style: e.target.value } : x)))}
                  >
                    {sectionDef(selSection.type)!.styles.map((st) => (
                      <option key={st} value={st}>
                        {STYLE_LABEL[st] ?? st}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {Object.entries(inspector.schema.fields).map(([k, f]) => {
                const value = (draftInspector ?? inspector.value)[k];
                return (
                  <FieldEditor
                    key={k}
                    field={f}
                    name={k}
                    path={`/${k}`}
                    value={value}
                    orig={inspector.value[k]}
                    onChange={(x) => setDraftInspector({ ...(draftInspector ?? inspector.value), [k]: x })}
                    ctx={{ canEdit: edit, superAdmin: me?.role === "super_admin" }}
                  />
                );
              })}
            </>
          )}
        </aside>
      </div>

      <Dialog open={adding !== null} onClose={() => setAdding(null)} title="افزودن بخش" wide>
        <div className="block-grid">
          {BLOCK_KINDS.map((k) => {
            const b = BLOCKS[k];
            return (
              <button key={k} type="button" className="block-tile" onClick={() => adding !== null && addBlock(k, adding)}>
                <b.icon size={28} aria-hidden />
                <b>{b.label}</b>
                <span className="small muted">{b.text}</span>
              </button>
            );
          })}
        </div>
      </Dialog>
      <Dialog open={!!picking} onClose={() => setPicking(null)} title="جایگزینی تصویر" wide>
        <MediaLibrary onPick={pickImage} accept="image/*" />
      </Dialog>
    </div>
  );
}
