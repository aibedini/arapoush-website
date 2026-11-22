"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Locale } from "@arapoush/schema";
import { api, ApiError } from "@/lib/api";
import { can, useApi, useMe } from "@/lib/hooks";
import { num } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { defaultOptions, localeName, runTranslate, TranslateFields, type TranslateOptions, type TranslateTarget } from "@/components/AiTranslate";

type Overview = {
  ai: boolean;
  locales: { code: Locale; name: string; native: string }[];
  entries: { type: string; label: string; total: number; filled: Record<string, number>; unpublished: boolean }[];
  posts: { id: string; title: string; status: string; locales: Locale[] }[];
  taxonomy: { total: number; filled: Record<string, number> };
};
type Item = { key: string; label: string; sub?: string; target: TranslateTarget; missing: (l: Locale) => number; publish?: () => Promise<unknown> };
type RowState = { state: "running" } | { state: "done"; written: number } | { state: "error"; error: ApiError };

const STATUS: Record<string, string> = { draft: "پیش‌نویس", review: "در بررسی", scheduled: "زمان‌بندی‌شده", published: "منتشرشده" };

/** AI translation for the whole site: pick languages, pick what (or everything), run, then publish. */
export default function TranslatePage() {
  const me = useMe();
  const ov = useApi<Overview>("/v1/manage/translate");
  const [o, setO] = useState<TranslateOptions>(defaultOptions);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const stop = useRef(false);

  if (ov.error) return <ErrorNote error={ov.error} />;
  if (!ov.data) return <Loading rows={10} />;
  const d = ov.data;
  const blog = can(me, "blog.write");

  const entries: Item[] = d.entries.map((e) => ({
    key: `e:${e.type}`,
    label: e.label,
    sub: e.type,
    target: { kind: "entry", type: e.type },
    missing: (l) => e.total - (e.filled[l] ?? 0),
    publish: can(me, "content.publish") ? () => api(`/v1/manage/entries/${encodeURIComponent(e.type)}/publish`, { body: {} }) : undefined,
  }));
  const posts: Item[] = blog
    ? d.posts.map((p) => ({
        key: `p:${p.id}`,
        label: p.title || "(بی‌عنوان)",
        sub: STATUS[p.status] ?? p.status,
        target: { kind: "post", id: p.id },
        missing: (l) => (p.locales.includes(l) ? 0 : 1),
        // Only posts already live are re-published (a draft stays a draft).
        publish: p.status === "published" && can(me, "blog.publish") ? () => api(`/v1/manage/blog/posts/${p.id}/publish`, { body: {} }) : undefined,
      }))
    : [];
  const taxonomy: Item[] =
    can(me, "blog.manage") && d.taxonomy.total
      ? [{ key: "t", label: "دسته‌ها، برچسب‌ها و نویسنده‌های بلاگ", sub: `${num(d.taxonomy.total)} متن`, target: { kind: "taxonomy" }, missing: (l) => d.taxonomy.total - (d.taxonomy.filled[l] ?? 0) }]
      : [];
  const all = [...entries, ...posts, ...taxonomy];
  const incomplete = (i: Item) => o.to.some((l) => i.missing(l) > 0);
  const chosen = all.filter((i) => picked.has(i.key));
  const pick = (list: Item[]) => setPicked(new Set(list.map((i) => i.key)));
  const toggle = (k: string, on: boolean) => setPicked((s) => (on ? new Set(s).add(k) : new Set([...s].filter((x) => x !== k))));
  const doneCount = chosen.filter((i) => rows[i.key]?.state === "done" || rows[i.key]?.state === "error").length;
  const translated = all.filter((i) => rows[i.key]?.state === "done" && (rows[i.key] as { written: number }).written > 0);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setPublished(null);
    setRows({});
    for (const i of chosen) {
      if (stop.current) break;
      setRows((r) => ({ ...r, [i.key]: { state: "running" } }));
      try {
        const res = await runTranslate(i.target, o);
        setRows((r) => ({ ...r, [i.key]: { state: "done", written: res.written } }));
      } catch (e) {
        setRows((r) => ({ ...r, [i.key]: { state: "error", error: e instanceof ApiError ? e : new ApiError(0, "CLIENT", String(e)) } }));
        // Without a key every item would fail the same way.
        if (e instanceof ApiError && e.code === "AI_OFF") break;
      }
    }
    setRunning(false);
    ov.reload();
  };
  const publishAll = async () => {
    setPublishing(true);
    let n = 0;
    for (const i of translated.filter((x) => x.publish)) {
      try {
        await i.publish!();
        n++;
      } catch (e) {
        setRows((r) => ({ ...r, [i.key]: { state: "error", error: e as ApiError } }));
      }
    }
    setPublishing(false);
    setPublished(`${num(n)} مورد منتشر شد.`);
    ov.reload();
  };

  const table = (title: string, list: Item[]) =>
    list.length > 0 && (
      <section className="card" aria-label={title}>
        <div className="card-head">
          <h2>{title}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ inlineSize: 40 }}>
                  <input type="checkbox" aria-label={`انتخاب همهٔ ${title}`} checked={list.every((i) => picked.has(i.key))} onChange={(e) => setPicked((s) => new Set([...[...s].filter((k) => !list.some((i) => i.key === k)), ...(e.target.checked ? list.map((i) => i.key) : [])]))} />
                </th>
                <th>مورد</th>
                {o.to.map((l) => (
                  <th key={l}>{localeName(l)}</th>
                ))}
                <th>نتیجه</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const r = rows[i.key];
                return (
                  <tr key={i.key}>
                    <td>
                      <input type="checkbox" aria-label={i.label} checked={picked.has(i.key)} disabled={running} onChange={(e) => toggle(i.key, e.target.checked)} />
                    </td>
                    <td>
                      {i.target.kind === "entry" ? (
                        <Link href={`/content/${encodeURIComponent(i.target.type)}`} style={{ fontWeight: 600 }}>
                          {i.label}
                        </Link>
                      ) : i.target.kind === "post" ? (
                        <Link href={`/blog/${i.target.id}`} style={{ fontWeight: 600 }}>
                          {i.label}
                        </Link>
                      ) : (
                        <Link href="/blog/settings" style={{ fontWeight: 600 }}>
                          {i.label}
                        </Link>
                      )}
                      {i.sub && <div className="small muted">{i.sub}</div>}
                    </td>
                    {o.to.map((l) => {
                      const m = i.missing(l);
                      return (
                        <td key={l}>
                          {m > 0 ? <span className="badge warn">{i.target.kind === "post" ? "ندارد" : `${num(m)} خالی`}</span> : <span className="badge ok">کامل</span>}
                        </td>
                      );
                    })}
                    <td className="small" aria-live="polite">
                      {!r ? (
                        <span className="muted">—</span>
                      ) : r.state === "running" ? (
                        <span className="badge accent">در حال ترجمه…</span>
                      ) : r.state === "done" ? (
                        <span className={`badge${r.written ? " ok" : ""}`}>{r.written ? `${num(r.written)} متن ترجمه شد` : "چیزی برای ترجمه نبود"}</span>
                      ) : (
                        <ErrorNote error={r.error} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );

  return (
    <>
      <PageHead title="ترجمه با هوش مصنوعی" sub="یک زبان مبدأ و چند زبان مقصد انتخاب کنید؛ صفحه‌ها، بخش‌ها و مقاله‌ها یکجا ترجمه و در پیش‌نویس ذخیره می‌شوند. تا وقتی منتشر نکنید روی سایت نمی‌روند." />
      {!d.ai && (
        <div className="note warn" role="status" style={{ marginBlockEnd: 12 }}>
          ترجمهٔ هوش مصنوعی روی سرور فعال نیست. کلید <code>ANTHROPIC_API_KEY</code> را در تنظیمات سرور (فایل env سرویس opex-api) بگذارید و سرویس را دوباره راه‌اندازی کنید.
        </div>
      )}
      <div className="grid">
        <section className="card" aria-label="زبان‌ها">
          <div className="card-body stack">
            <TranslateFields value={o} onChange={setO} disabled={running} />
            <div className="row">
              <span className="small muted">انتخاب:</span>
              <button type="button" className="btn sm" disabled={running} onClick={() => pick(all)}>
                همه
              </button>
              <button type="button" className="btn sm" disabled={running} onClick={() => pick(all.filter(incomplete))}>
                فقط ناقص‌ها
              </button>
              <button type="button" className="btn sm" disabled={running} onClick={() => pick([])}>
                هیچ‌کدام
              </button>
              <span style={{ flex: 1 }} />
              {running ? (
                <>
                  <span className="small" role="status">
                    {num(doneCount)} از {num(chosen.length)}
                  </span>
                  <button type="button" className="btn" onClick={() => (stop.current = true)}>
                    توقف
                  </button>
                </>
              ) : (
                <button type="button" className="btn primary" disabled={!chosen.length || !o.to.length || !d.ai} onClick={run}>
                  ترجمهٔ {num(chosen.length)} مورد به {o.to.map(localeName).join("، ") || "—"}
                </button>
              )}
            </div>
            {!running && translated.length > 0 && (
              <div className="note ok row" role="status">
                <span>
                  {num(translated.length)} مورد ترجمه شد و در پیش‌نویس است. پیش از انتشار چند صفحه را در پیش‌نمایش ببینید.
                </span>
                {translated.some((i) => i.publish) && (
                  <button type="button" className="btn sm primary" disabled={publishing} onClick={publishAll}>
                    {publishing ? "در حال انتشار…" : `انتشار ${num(translated.filter((i) => i.publish).length)} مورد`}
                  </button>
                )}
              </div>
            )}
            {published && (
              <div className="note ok" role="status">
                {published}
              </div>
            )}
          </div>
        </section>
        {table("صفحه‌ها و بخش‌های سایت", entries)}
        {table("مقاله‌های بلاگ", posts)}
        {table("فهرست‌های بلاگ", taxonomy)}
      </div>
    </>
  );
}
