"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLOG_SECTIONS, type BlogSection, type BlogSettings } from "@arapoush/schema";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

const SECTION_LABEL: Record<BlogSection, [string, string]> = {
  comments: ["دیدگاه‌ها", "فرم دیدگاه و دیدگاه‌های تأییدشده زیر مقاله‌ها"],
  newsletter: ["خبرنامه", "فرم عضویت در مقاله‌ها و فهرست مجله، و ایمیل مقاله‌های تازه"],
  search: ["جست‌وجو", "کادر جست‌وجو در مجله"],
  related: ["مقاله‌های مرتبط", "سه مقالهٔ مشابه پایان هر مقاله"],
  share: ["اشتراک‌گذاری", "دکمه‌های LinkedIn، تلگرام، واتس‌اپ و X"],
  toc: ["فهرست مطالب", "فهرست سرتیترها کنار یا بالای مقاله"],
  takeaways: ["نکته‌های کلیدی", "کادر TL;DR بالای متن"],
  faq: ["پرسش‌های متداول", "بخش FAQ و داده‌های ساختاریافتهٔ آن"],
  sources: ["منابع", "فهرست منابع پایان مقاله"],
  authorBox: ["معرفی نویسنده", "کادر نویسنده پایان مقاله"],
  readingTime: ["زمان مطالعه", "«۵ دقیقه مطالعه» در کارت‌ها و مقاله"],
  products: ["محصولات مرتبط", "پیوند به صفحه‌های محصول کنار مقاله"],
  rss: ["خوراک RSS", "/blog/feed.xml برای هر زبان"],
  homeFeed: ["نمایش در صفحهٔ اول", "مقاله‌های تازه در بخش Insights صفحهٔ اول"],
};

/** Blog switches: the whole journal, each part of it, and the comment rules. */
export default function BlogConfig() {
  const me = useMe();
  const res = useApi<{ settings: BlogSettings; env: { mail: boolean; ai: boolean } }>("/v1/manage/blog/settings");
  const act = useAction();
  const [s, setS] = useState<BlogSettings | null>(null);
  useEffect(() => {
    if (res.data && !s) setS(res.data.settings);
  }, [res.data, s]);
  const editable = can(me, "blog.manage");
  if (!s || !res.data) return <Loading />;
  const sec = (k: BlogSection, v: boolean) => setS({ ...s, sections: { ...s.sections, [k]: v } });
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(() => api("/v1/manage/blog/settings", { method: "PUT", body: s }), "ذخیره شد؛ سایت تا چند ثانیهٔ دیگر به‌روز می‌شود.");
  };
  return (
    <>
      <div className="small" style={{ marginBlockEnd: 8 }}>
        <Link href="/blog">بلاگ</Link> / تنظیمات بلاگ
      </div>
      <PageHead title="تنظیمات بلاگ" sub="هر بخش مجله را برای کل سایت روشن یا خاموش کنید. دیدگاه‌ها را برای یک مقالهٔ خاص در صفحهٔ همان مقاله هم می‌شود بست." />
      <form className="grid" onSubmit={save}>
        <ErrorNote error={act.error ?? res.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        <fieldset disabled={!editable} className="card" style={{ padding: 0, margin: 0 }}>
          <legend className="sr-only">مجله</legend>
          <div className="card-body stack">
            <label className="check">
              <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
              <span>
                <strong>مجله روی سایت فعال باشد</strong>
                <span className="small muted"> — خاموش: همهٔ صفحه‌های مجله 404 می‌شوند و پیوند منو حذف می‌شود.</span>
              </span>
            </label>
            <label className="f" style={{ maxInlineSize: 220 }}>
              <span>مقاله در هر صفحهٔ فهرست</span>
              <input type="number" min={6} max={48} value={s.perPage} onChange={(e) => setS({ ...s, perPage: Number(e.target.value) })} />
            </label>
          </div>
        </fieldset>

        <fieldset disabled={!editable || !s.enabled} className="card" style={{ padding: 0, margin: 0 }}>
          <legend className="sr-only">بخش‌ها</legend>
          <div className="card-head">
            <h2>بخش‌ها</h2>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {BLOG_SECTIONS.map((k) => (
              <label key={k} className="check" style={{ alignItems: "flex-start" }}>
                <input type="checkbox" checked={s.sections[k]} onChange={(e) => sec(k, e.target.checked)} />
                <span>
                  {SECTION_LABEL[k][0]}
                  <span className="small muted" style={{ display: "block" }}>
                    {SECTION_LABEL[k][1]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {s.sections.newsletter && !res.data.env.mail && <div className="card-body note warn">ایمیل سرور (SMTP_URL) تنظیم نشده؛ ایمیل‌های تأیید و خبرنامه فرستاده نمی‌شوند.</div>}
        </fieldset>

        <fieldset disabled={!editable || !s.enabled || !s.sections.comments} className="card" style={{ padding: 0, margin: 0 }}>
          <legend className="sr-only">قواعد دیدگاه</legend>
          <div className="card-head">
            <h2>قواعد دیدگاه‌ها</h2>
          </div>
          <div className="card-body stack">
            <label className="f" style={{ maxInlineSize: 420 }}>
              <span>بررسی پیش از انتشار</span>
              <select value={s.comments.moderation} onChange={(e) => setS({ ...s, comments: { ...s.comments, moderation: e.target.value as "all" } })}>
                <option value="all">همهٔ دیدگاه‌ها بررسی شوند (پیشنهادی)</option>
                <option value="known">کسانی که قبلاً تأیید شده‌اند مستقیم منتشر شوند</option>
                <option value="none">بدون بررسی منتشر شوند</option>
              </select>
            </label>
            <label className="f" style={{ maxInlineSize: 300 }}>
              <span>بستن خودکار پس از چند روز (۰ = هرگز)</span>
              <input type="number" min={0} max={3650} value={s.comments.closeAfterDays} onChange={(e) => setS({ ...s, comments: { ...s.comments, closeAfterDays: Number(e.target.value) } })} />
            </label>
            <label className="f" style={{ maxInlineSize: 300 }}>
              <span>بیشترین پیوند در یک دیدگاه (ضد اسپم)</span>
              <input type="number" min={0} max={10} value={s.comments.maxLinks} onChange={(e) => setS({ ...s, comments: { ...s.comments, maxLinks: Number(e.target.value) } })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={s.comments.requireEmail} onChange={(e) => setS({ ...s, comments: { ...s.comments, requireEmail: e.target.checked } })} />
              ایمیل اجباری باشد (نمایش داده نمی‌شود)
            </label>
          </div>
        </fieldset>
        {editable && (
          <div className="row">
            <button className="btn primary" disabled={act.busy}>
              ذخیره
            </button>
          </div>
        )}
      </form>
    </>
  );
}
