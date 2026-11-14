"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BLOG_PRODUCTS, emptyTranslation, isLive, LOCALES, slugify, type BlogFaq, type BlogPostData, type BlogSource, type BlogTranslation, type Locale } from "@arapoush/schema";
import { api, ApiError } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, when } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { BlockEditor, ImagePick, Lines } from "../_components/BlockEditor";
import { SeoPanel } from "../_components/SeoPanel";
import { LOCALE_NAME, nm, PRODUCT_NAME, STATUS, type PostDetail, type PostSummary, type Taxonomy } from "../_components/lib";

type Rev = { id: string; number: number; createdAt: string; author: string | null; note: string | null; published: boolean; draft: boolean };

/** Empty image blocks and blank list rows would fail validation; they are dropped on save. */
function clean(d: BlogPostData): BlogPostData {
  const translations = Object.fromEntries(
    Object.entries(d.translations).map(([l, t]) => [
      l,
      {
        ...t,
        body: t.body.filter((b) => b.kind !== "image" || !!b.image.src).map((b) => (b.kind === "list" ? { ...b, items: b.items.filter((x) => x.trim()) } : b)),
        keyTakeaways: t.keyTakeaways.filter((x) => x.trim()),
        faq: t.faq.filter((f) => f.q.trim() || f.a.trim()),
        sources: t.sources.filter((s) => s.url.trim()),
        seo: { ...t.seo, canonical: t.seo.canonical?.trim() || undefined },
      },
    ]),
  ) as BlogPostData["translations"];
  return { ...d, translations };
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function PostEditor() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const post = useApi<PostDetail>(`/v1/manage/blog/posts/${id}`);
  const tax = useApi<Taxonomy>("/v1/manage/blog/taxonomy");
  const others = useApi<PostSummary[]>("/v1/manage/blog/posts?status=published");
  const revs = useApi<Rev[]>(`/v1/manage/blog/posts/${id}/revisions`);
  const act = useAction();
  const [data, setData] = useState<BlogPostData | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loc, setLoc] = useState<Locale>("fa");
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [newTag, setNewTag] = useState("");
  const slugTouched = useRef<Partial<Record<Locale, boolean>>>({});

  useEffect(() => {
    if (post.data && !data) {
      setData(post.data.data);
      setBase(post.data.draftRevisionId);
      for (const l of LOCALES) if (post.data.data.translations[l]?.slug) slugTouched.current[l] = true;
    }
  }, [post.data, data]);

  const p = post.data;
  const editable = !!p?.can.edit && p.status !== "archived";
  const update = (fn: (d: BlogPostData) => BlogPostData) => {
    setData((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const tr = data?.translations[loc];
  const setTr = (patch: Partial<BlogTranslation>) => update((d) => ({ ...d, translations: { ...d.translations, [loc]: { ...(d.translations[loc] ?? emptyTranslation()), ...patch } } }));

  const save = useCallback(async () => {
    if (!data) return null;
    const r = await api<{ revisionId: string; revision: number; changed: boolean }>(`/v1/manage/blog/posts/${id}`, { method: "PUT", body: { data: clean(data), baseRevisionId: base } });
    setBase(r.revisionId);
    setDirty(false);
    post.reload();
    revs.reload();
    return r;
  }, [data, base, id, post, revs]);
  const saveAction = () => act.run(save, "ذخیره شد.");
  const thenSave = async () => {
    if (dirty) await save();
  };

  // Ctrl+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editable && dirty) void act.run(save, "ذخیره شد.");
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leave);
    };
  }, [dirty, editable, save, act]);

  const call = (path: string, body: unknown, ok: string, method = "POST") =>
    act.run(async () => {
      await thenSave();
      await api(`/v1/manage/blog/posts/${id}${path}`, { method, body });
      post.reload();
      revs.reload();
    }, ok);
  const preview = () =>
    act.run(async () => {
      await thenSave();
      const r = await api<{ url: string }>(`/v1/manage/blog/posts/${id}/preview`, { body: { locale: loc } });
      window.open(r.url, "_blank", "noopener");
    });
  const addTag = () =>
    act.run(async () => {
      const name = newTag.trim();
      if (!name) return;
      const r = await api<{ id: string }>("/v1/manage/blog/tags", { body: { name: { [loc]: name }, slug: slugify(name) } });
      setNewTag("");
      tax.reload();
      update((d) => ({ ...d, tagIds: [...d.tagIds, r.id] }));
    });
  const restore = (rev: Rev) =>
    confirm(`نسخهٔ ${rev.number} پیش‌نویس شود؟ (منتشرشده دست نمی‌خورد تا دوباره منتشر کنید)`) &&
    act.run(async () => {
      if (dirty && !confirm("تغییرهای ذخیره‌نشده از بین می‌روند. ادامه؟")) return;
      await api(`/v1/manage/blog/posts/${id}/restore`, { body: { revisionId: rev.id } });
      setData(null);
      setDirty(false);
      post.reload();
      revs.reload();
    }, "نسخه بازگردانده شد؛ برای رفتن روی سایت منتشر کنید.");

  if (post.error) return <ErrorNote error={post.error} />;
  if (!p || !data) return <Loading />;
  const conflict = act.error instanceof ApiError && act.error.code === "CONFLICT_BASE_REVISION";
  const title = data.translations.fa?.title || data.translations.en?.title || data.translations.tr?.title || "مقالهٔ بی‌عنوان";

  return (
    <>
      <div className="small" style={{ marginBlockEnd: 8 }}>
        <Link href="/blog">بلاگ</Link> / {title}
      </div>
      <PageHead title={title} sub={`${STATUS[p.status][0]} · نسخهٔ ${p.revision}${p.publishedAt ? ` · آخرین انتشار ${ago(p.publishedAt)}` : ""}${dirty ? " · تغییرهای ذخیره‌نشده" : ""}`}>
        {editable && (
          <button type="button" className="btn primary" onClick={saveAction} disabled={act.busy || !dirty} title="Ctrl+S">
            ذخیره
          </button>
        )}
        {can(me, "preview.use") && tr && (
          <button type="button" className="btn" onClick={preview} disabled={act.busy}>
            پیش‌نمایش ({LOCALE_NAME[loc]})
          </button>
        )}
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error} />
        {conflict && (
          <div className="note warn" role="alert">
            کس دیگری این مقاله را در این فاصله ذخیره کرده است. متن خود را جایی نگه دارید، صفحه را تازه کنید و دوباره اعمال کنید.
          </div>
        )}
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        {!p.can.edit && <div className="note">این مقاله را نویسندهٔ دیگری نوشته؛ فقط می‌توانید آن را ببینید.</div>}

        <div className="blog-editor">
          <div className="stack">
            <div className="tabs" role="tablist" aria-label="زبان‌ها">
              {LOCALES.map((l) => (
                <button key={l} type="button" role="tab" aria-selected={loc === l} onClick={() => setLoc(l)}>
                  {LOCALE_NAME[l]} <span className={`badge${isLive(data.translations[l]) ? " ok" : data.translations[l] ? " warn" : ""}`}>{isLive(data.translations[l]) ? "آماده" : data.translations[l] ? "ناقص" : "ندارد"}</span>
                </button>
              ))}
            </div>

            {!tr ? (
              <section className="card">
                <div className="card-body stack" style={{ alignItems: "start" }}>
                  <p>این مقاله هنوز به {LOCALE_NAME[loc]} نوشته نشده است. ترجمه با نشانی (slug) خودش منتشر می‌شود و موتورهای جست‌وجو نسخه‌ها را به هم وصل می‌کنند (hreflang).</p>
                  {editable && (
                    <button type="button" className="btn primary" onClick={() => setTr({ enabled: true })}>
                      شروع ترجمهٔ {LOCALE_NAME[loc]}
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0, margin: 0 }} dir={loc === "fa" ? "rtl" : "ltr"}>
                <section className="card">
                  <div className="card-body stack">
                    <label className="check">
                      <input type="checkbox" checked={tr.enabled} onChange={(e) => setTr({ enabled: e.target.checked })} />
                      این زبان با انتشار روی سایت برود
                    </label>
                    <label className="f">
                      <span>عنوان (H1)</span>
                      <input
                        className="be-title"
                        value={tr.title}
                        maxLength={200}
                        onChange={(e) => setTr({ title: e.target.value, ...(slugTouched.current[loc] ? {} : { slug: slugify(e.target.value) }) })}
                        placeholder="عنوانی روشن که پرسش خواننده را پاسخ می‌دهد"
                      />
                    </label>
                    <label className="f">
                      <span>نشانی (slug)</span>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <input
                          dir="auto"
                          value={tr.slug}
                          maxLength={100}
                          onChange={(e) => {
                            slugTouched.current[loc] = true;
                            setTr({ slug: slugify(e.target.value) });
                          }}
                        />
                        <button type="button" className="btn sm" onClick={() => setTr({ slug: slugify(tr.title) })}>
                          از عنوان
                        </button>
                      </div>
                      {p.publishedRevisionId && p.slugs.some((s) => s.locale === loc && s.current && s.slug !== tr.slug) && <span className="small muted">نشانی قبلی پس از انتشار با ریدایرکت ۳۰۱ به نشانی تازه می‌رود.</span>}
                    </label>
                    <label className="f">
                      <span>
                        خلاصهٔ پاسخ‌محور ({[...tr.excerpt].length}/۶۰۰) — دو جملهٔ اول، پاسخ مستقیم به موضوع
                      </span>
                      <textarea rows={3} maxLength={600} value={tr.excerpt} onChange={(e) => setTr({ excerpt: e.target.value })} />
                    </label>
                  </div>
                </section>

                <section className="card" aria-labelledby="body-h">
                  <div className="card-head">
                    <h2 id="body-h">متن مقاله</h2>
                  </div>
                  <div className="card-body">
                    <BlockEditor blocks={tr.body} onChange={(body) => setTr({ body })} readOnly={!editable} />
                  </div>
                </section>

                <section className="card" aria-labelledby="tk-h">
                  <div className="card-head">
                    <h2 id="tk-h">نکته‌های کلیدی (TL;DR)</h2>
                  </div>
                  <div className="card-body">
                    <Lines values={tr.keyTakeaways} onChange={(keyTakeaways) => setTr({ keyTakeaways })} max={300} limit={10} label="نکته" />
                  </div>
                </section>

                <section className="card" aria-labelledby="faq-h">
                  <div className="card-head">
                    <h2 id="faq-h">پرسش‌های متداول (FAQ schema)</h2>
                  </div>
                  <div className="card-body stack">
                    {tr.faq.map((f, i) => (
                      <div key={i} className="be-block">
                        <input aria-label={`پرسش ${i + 1}`} placeholder="پرسش" maxLength={300} value={f.q} onChange={(e) => setTr({ faq: tr.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                        <textarea aria-label={`پاسخ ${i + 1}`} placeholder="پاسخ کوتاه و دقیق" rows={2} maxLength={2000} value={f.a} onChange={(e) => setTr({ faq: tr.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
                        <button type="button" className="btn sm ghost" style={{ justifySelf: "start" }} onClick={() => setTr({ faq: tr.faq.filter((_, j) => j !== i) })}>
                          حذف پرسش
                        </button>
                      </div>
                    ))}
                    {tr.faq.length < 20 && (
                      <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => setTr({ faq: [...tr.faq, { q: "", a: "" } as BlogFaq] })}>
                        + پرسش
                      </button>
                    )}
                  </div>
                </section>

                <section className="card" aria-labelledby="src-h">
                  <div className="card-head">
                    <h2 id="src-h">منابع</h2>
                  </div>
                  <div className="card-body stack">
                    {tr.sources.map((s, i) => (
                      <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
                        <input aria-label={`عنوان منبع ${i + 1}`} placeholder="عنوان (مثلاً استاندارد ISO 15378)" maxLength={300} value={s.title} onChange={(e) => setTr({ sources: tr.sources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                        <input aria-label={`نشانی منبع ${i + 1}`} dir="ltr" placeholder="https://…" maxLength={500} value={s.url} onChange={(e) => setTr({ sources: tr.sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                        <button type="button" className="btn sm ghost" onClick={() => setTr({ sources: tr.sources.filter((_, j) => j !== i) })} aria-label={`حذف منبع ${i + 1}`}>
                          ×
                        </button>
                      </div>
                    ))}
                    {tr.sources.length < 30 && (
                      <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => setTr({ sources: [...tr.sources, { title: "", url: "" } as BlogSource] })}>
                        + منبع
                      </button>
                    )}
                  </div>
                </section>
              </fieldset>
            )}
          </div>

          <aside className="stack">
            <section className="card" aria-labelledby="pub-h">
              <div className="card-head">
                <h2 id="pub-h">انتشار</h2>
                <span className={`badge ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>
              </div>
              <div className="card-body stack">
                <dl className="ov-dl small">
                  <div>
                    <dt>نخستین انتشار</dt>
                    <dd>{when(p.firstPublishedAt)}</dd>
                  </div>
                  <div>
                    <dt>آخرین انتشار</dt>
                    <dd>{when(p.publishedAt)}</dd>
                  </div>
                  {p.scheduledAt && (
                    <div>
                      <dt>زمان‌بندی</dt>
                      <dd>{when(p.scheduledAt)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>زبان‌های آماده</dt>
                    <dd>{LOCALES.filter((l) => isLive(data.translations[l])).map((l) => LOCALE_NAME[l]).join("، ") || "—"}</dd>
                  </div>
                </dl>
                {p.can.publish ? (
                  <>
                    <button type="button" className="btn primary" disabled={act.busy || p.status === "archived"} onClick={() => call("/publish", {}, "منتشر شد؛ سایت تا چند ثانیهٔ دیگر به‌روز می‌شود.")}>
                      {p.publishedRevisionId ? "انتشار تغییرها" : "انتشار"}
                    </button>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <input type="datetime-local" aria-label="زمان انتشار" value={at} onChange={(e) => setAt(e.target.value)} dir="ltr" />
                      <button type="button" className="btn" disabled={act.busy || p.status === "archived"} onClick={() => call("/publish", { at: new Date(at).toISOString() }, "زمان‌بندی شد.")}>
                        زمان‌بندی
                      </button>
                    </div>
                    {p.publishedRevisionId && (
                      <button type="button" className="btn danger" disabled={act.busy} onClick={() => confirm("مقاله از سایت برداشته شود؟ نشانی‌هایش 404 می‌شوند.") && call("/unpublish", {}, "از سایت برداشته شد.")}>
                        برداشتن از سایت
                      </button>
                    )}
                  </>
                ) : (
                  editable &&
                  p.status !== "review" && (
                    <button type="button" className="btn primary" disabled={act.busy} onClick={() => call("/submit", {}, "برای بازبینی فرستاده شد.")}>
                      ارسال برای بازبینی
                    </button>
                  )
                )}
                {p.can.delete && p.status !== "archived" && (
                  <button
                    type="button"
                    className="btn ghost danger"
                    disabled={act.busy}
                    onClick={() =>
                      confirm("مقاله بایگانی شود؟ از سایت و فهرست برداشته می‌شود؛ نسخه‌ها می‌مانند.") &&
                      act.run(async () => {
                        await api(`/v1/manage/blog/posts/${id}`, { method: "DELETE" });
                        router.push("/blog");
                      })
                    }
                  >
                    بایگانی
                  </button>
                )}
              </div>
            </section>

            <SeoPanel data={data} locale={loc} />

            {tr && (
              <fieldset disabled={!editable} className="card" style={{ padding: 0, margin: 0 }}>
                <legend className="sr-only">تنظیمات سئو</legend>
                <div className="card-head">
                  <h2>تنظیمات سئو ({LOCALE_NAME[loc]})</h2>
                </div>
                <div className="card-body stack">
                  <label className="f">
                    <span>عنوان سئو ({[...(tr.seo.title ?? "")].length}/۶۰؛ خالی = عنوان مقاله)</span>
                    <input value={tr.seo.title ?? ""} maxLength={120} onChange={(e) => setTr({ seo: { ...tr.seo, title: e.target.value } })} />
                  </label>
                  <label className="f">
                    <span>توضیح متا ({[...(tr.seo.description ?? "")].length}/۱۶۰؛ خالی = خلاصه)</span>
                    <textarea rows={3} maxLength={320} value={tr.seo.description ?? ""} onChange={(e) => setTr({ seo: { ...tr.seo, description: e.target.value } })} />
                  </label>
                  <label className="f">
                    <span>عبارت کلیدی اصلی</span>
                    <input value={tr.seo.keyphrase ?? ""} maxLength={100} onChange={(e) => setTr({ seo: { ...tr.seo, keyphrase: e.target.value } })} />
                  </label>
                  <label className="f">
                    <span>canonical (فقط اگر نسخهٔ اصلی جای دیگری است)</span>
                    <input dir="ltr" value={tr.seo.canonical ?? ""} maxLength={500} placeholder="https://…" onChange={(e) => setTr({ seo: { ...tr.seo, canonical: e.target.value } })} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={!!tr.seo.noindex} onChange={(e) => setTr({ seo: { ...tr.seo, noindex: e.target.checked } })} />
                    از نتایج جست‌وجو پنهان بماند (noindex)
                  </label>
                  <ImagePick label="تصویر اشتراک‌گذاری (اختیاری؛ پیش‌فرض: تصویر شاخص)" value={tr.seo.ogImage ?? null} onChange={(v) => setTr({ seo: { ...tr.seo, ogImage: v } })} />
                </div>
              </fieldset>
            )}

            <fieldset disabled={!editable} className="card" style={{ padding: 0, margin: 0 }}>
              <legend className="sr-only">دسته‌بندی و ارتباط‌ها</legend>
              <div className="card-head">
                <h2>دسته‌بندی و ارتباط‌ها</h2>
              </div>
              <div className="card-body stack">
                <ImagePick label="تصویر شاخص" value={data.cover} onChange={(cover) => update((d) => ({ ...d, cover }))} />
                <label className="f">
                  <span>دسته</span>
                  <select value={data.categoryId ?? ""} onChange={(e) => update((d) => ({ ...d, categoryId: e.target.value || null }))}>
                    <option value="">—</option>
                    {tax.data?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {nm(c.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>نویسنده</span>
                  <select value={data.authorId ?? ""} onChange={(e) => update((d) => ({ ...d, authorId: e.target.value || null }))}>
                    <option value="">—</option>
                    {tax.data?.authors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {nm(a.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>بازبین فنی (اختیاری)</span>
                  <select value={data.reviewerId ?? ""} onChange={(e) => update((d) => ({ ...d, reviewerId: e.target.value || null }))}>
                    <option value="">—</option>
                    {tax.data?.authors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {nm(a.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="small muted">برچسب‌ها</span>
                  <div className="row" style={{ gap: 6 }}>
                    {tax.data?.tags.map((t) => (
                      <label key={t.id} className="check small">
                        <input type="checkbox" checked={data.tagIds.includes(t.id)} onChange={(e) => update((d) => ({ ...d, tagIds: e.target.checked ? [...d.tagIds, t.id] : d.tagIds.filter((x) => x !== t.id) }))} />
                        {nm(t.name)}
                      </label>
                    ))}
                  </div>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input aria-label="برچسب تازه" placeholder="برچسب تازه" value={newTag} maxLength={60} onChange={(e) => setNewTag(e.target.value)} />
                    <button type="button" className="btn sm" onClick={addTag} disabled={!newTag.trim()}>
                      افزودن
                    </button>
                  </div>
                </div>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="small muted">محصولات مرتبط (پایان مقاله)</span>
                  {BLOG_PRODUCTS.map((k) => (
                    <label key={k} className="check small">
                      <input type="checkbox" checked={data.products.includes(k)} onChange={(e) => update((d) => ({ ...d, products: e.target.checked ? [...d.products, k] : d.products.filter((x) => x !== k) }))} />
                      {PRODUCT_NAME[k]}
                    </label>
                  ))}
                </div>
                <label className="f">
                  <span>مقاله‌های مرتبط (تا ۶؛ بقیه خودکار از همین دسته)</span>
                  <select
                    multiple
                    size={5}
                    value={data.relatedIds}
                    onChange={(e) => update((d) => ({ ...d, relatedIds: Array.from(e.target.selectedOptions, (o) => o.value).slice(0, 6) }))}
                  >
                    {(others.data ?? [])
                      .filter((o) => o.id !== id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.titles.fa || o.titles.en || o.titles.tr}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={data.featured} onChange={(e) => update((d) => ({ ...d, featured: e.target.checked }))} />
                  مقالهٔ ویژه
                </label>
              </div>
            </fieldset>

            <section className="card" aria-labelledby="rev-h">
              <div className="card-head">
                <h2 id="rev-h">تاریخچهٔ نسخه‌ها</h2>
              </div>
              {!revs.data ? (
                <div className="card-body">
                  <Loading rows={3} />
                </div>
              ) : (
                <ul className="card-body stack small" style={{ listStyle: "none", margin: 0, maxBlockSize: 320, overflow: "auto" }}>
                  {revs.data.map((r) => (
                    <li key={r.id} className="row" style={{ justifyContent: "space-between" }}>
                      <span>
                        #{r.number} · {r.author ?? "سیستم"} · {ago(r.createdAt)}
                        {r.published && <span className="badge ok"> روی سایت</span>}
                        {r.draft && <span className="badge"> پیش‌نویس</span>}
                        {r.note && <span className="muted"> — {r.note}</span>}
                      </span>
                      {p.can.publish && !r.draft && (
                        <button type="button" className="btn sm ghost" onClick={() => restore(r)}>
                          بازگردانی
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
