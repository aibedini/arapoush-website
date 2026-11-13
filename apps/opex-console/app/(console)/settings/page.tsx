"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type Analytics = { ga4: string | null; gtm: string | null; clarity: string | null; yandex: string | null; matomo: { url: string; siteId: string } | null; consent: boolean; verification: { google: string | null; bing: string | null; yandex: string | null } };
type Seo = { indexing: boolean; schedule: "off" | "daily" | "weekly"; afterPublish: boolean; minScore: number; pages: string[] };
type Security = { contactEmail: string | null; policyUrl: string | null };
type Settings = {
  analytics: Analytics;
  seo: Seo;
  security: Security;
  updated: Record<string, { at: string; by: string | null }>;
  status: {
    ssl: { https: boolean; validTo: string | null; issuer: string | null; daysLeft: number | null; error: string | null };
    headers: { name: string; present: boolean; value: string | null }[];
    env: { siteUrl: string; publicUrl: string; consoleAllowlist: string[]; turnstile: boolean; mail: boolean; clamav: boolean };
  };
};
type Tab = "company" | "analytics" | "seo" | "security";
const TABS: [Tab, string][] = [
  ["company", "اطلاعات شرکت و فوتر"],
  ["analytics", "آنالیتیکس و تأیید مالکیت"],
  ["seo", "سئو و ایندکس"],
  ["security", "امنیت و SSL"],
];
const n = (v: string) => (v.trim() ? v.trim() : null);

/** S3: every site setting in one place. Company details are content (global.site), edited in the content editor. */
export default function SettingsPage() {
  const me = useMe();
  const s = useApi<Settings>("/v1/manage/settings");
  const act = useAction();
  const [tab, setTab] = useState<Tab>("company");
  const [a, setA] = useState<Analytics | null>(null);
  const [seo, setSeo] = useState<Seo | null>(null);
  const [sec, setSec] = useState<Security | null>(null);
  useEffect(() => {
    if (!s.data) return;
    setA(s.data.analytics);
    setSeo(s.data.seo);
    setSec(s.data.security);
  }, [s.data]);
  const write = can(me, "settings.write");
  const save = (section: "analytics" | "seo" | "security", body: unknown) =>
    act.run(async () => {
      await api(`/v1/manage/settings/${section}`, { method: "PUT", body });
      s.reload();
    }, "ذخیره شد. سایت تا چند ثانیهٔ دیگر به‌روز می‌شود.");

  return (
    <>
      <PageHead title="تنظیمات سایت" sub="اطلاعات پایهٔ شرکت، کدهای آنالیتیکس، سئو، امنیت و گواهی SSL." />
      <div className="row" role="tablist" aria-label="بخش‌های تنظیمات" style={{ marginBlockEnd: 12, flexWrap: "wrap" }}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn sm${tab === k ? " primary" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid">
        <ErrorNote error={act.error ?? s.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        {!s.data || !a || !seo || !sec ? (
          <Loading />
        ) : tab === "company" ? (
          <section className="card">
            <div className="card-body stack">
              <p>نام شرکت، لوگو (روشن و سفید)، تصویر اشتراک‌گذاری، نشانی، تلفن، ایمیل، شبکه‌های اجتماعی، فهرست منو و متن‌های فوتر بخشی از محتوای سایت‌اند و مثل هر صفحه با پیش‌نویس، پیش‌نمایش و انتشار ویرایش می‌شوند.</p>
              <div className="row">
                <Link className="btn primary" href="/content/global.site">
                  ویرایش اطلاعات شرکت، لوگو و فوتر
                </Link>
                <Link className="btn" href="/content/page.contact">
                  نشانی دفترها و واحدها (صفحهٔ تماس)
                </Link>
                <Link className="btn" href="/visual">
                  ویرایش روی خود سایت
                </Link>
              </div>
              <p className="small muted">لوگوها قفل‌اند: فقط مدیر ارشد با تأیید دوباره می‌تواند آن‌ها را عوض کند. اطلاعات تماس و شبکه‌های اجتماعی فقط برای اپراتورهاست (شرکا آن‌ها را نمی‌بینند).</p>
            </div>
          </section>
        ) : tab === "analytics" ? (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              save("analytics", a);
            }}
          >
            <div className="card-body stack">
              <p className="small muted">فقط شناسه‌ها پذیرفته می‌شوند، نه کد HTML؛ سایت خودش برچسب‌ها را می‌سازد و بعد از بارگذاری صفحه (و با رضایت بازدیدکننده) اجرا می‌کند، پس سرعت و امنیت سایت حفظ می‌شود.</p>
              <Field label="Google Analytics 4 (G-…)" value={a.ga4} onChange={(v) => setA({ ...a, ga4: n(v) })} pattern="G-[A-Z0-9]{4,12}" disabled={!write} />
              <Field label="Google Tag Manager (GTM-…)" value={a.gtm} onChange={(v) => setA({ ...a, gtm: n(v) })} pattern="GTM-[A-Z0-9]{4,10}" disabled={!write} />
              <Field label="Microsoft Clarity" value={a.clarity} onChange={(v) => setA({ ...a, clarity: n(v) })} pattern="[a-z0-9]{6,12}" disabled={!write} />
              <Field label="Yandex Metrica" value={a.yandex} onChange={(v) => setA({ ...a, yandex: n(v) })} pattern="\d{5,12}" disabled={!write} />
              <div className="row">
                <Field label="Matomo: نشانی (https)" value={a.matomo?.url ?? null} onChange={(v) => setA({ ...a, matomo: n(v) ? { url: v.trim(), siteId: a.matomo?.siteId ?? "1" } : null })} disabled={!write} />
                <Field label="Matomo: شناسهٔ سایت" value={a.matomo?.siteId ?? null} onChange={(v) => a.matomo && setA({ ...a, matomo: { ...a.matomo, siteId: v.trim() } })} pattern="\d{1,6}" disabled={!write || !a.matomo} />
              </div>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={a.consent} disabled={!write} onChange={(e) => setA({ ...a, consent: e.target.checked })} />
                <span>آمار فقط بعد از رضایت بازدیدکننده (نوار رضایت)</span>
              </label>
              <h3>تأیید مالکیت در کنسول‌های جستجو</h3>
              <Field label="Google Search Console (content برچسب meta)" value={a.verification.google} onChange={(v) => setA({ ...a, verification: { ...a.verification, google: n(v) } })} disabled={!write} />
              <Field label="Bing Webmaster (msvalidate.01)" value={a.verification.bing} onChange={(v) => setA({ ...a, verification: { ...a.verification, bing: n(v) } })} disabled={!write} />
              <Field label="Yandex Webmaster" value={a.verification.yandex} onChange={(v) => setA({ ...a, verification: { ...a.verification, yandex: n(v) } })} disabled={!write} />
              <Updated u={s.data.updated.analytics} />
              {write && (
                <div>
                  <button className="btn primary" disabled={act.busy}>
                    ذخیره
                  </button>
                </div>
              )}
            </div>
          </form>
        ) : tab === "seo" ? (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              save("seo", seo);
            }}
          >
            <div className="card-body stack">
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={seo.indexing} disabled={!write} onChange={(e) => setSeo({ ...seo, indexing: e.target.checked })} />
                <span>اجازهٔ ایندکس به موتورهای جستجو (خاموش برای نسخهٔ آزمایشی: همهٔ صفحه‌ها noindex می‌شوند)</span>
              </label>
              {!seo.indexing && (
                <div className="note bad" role="alert">
                  ایندکس خاموش است؛ سایت در گوگل دیده نمی‌شود.
                </div>
              )}
              <label className="f">
                <span>بررسی خودکار سئو</span>
                <select value={seo.schedule} disabled={!write} onChange={(e) => setSeo({ ...seo, schedule: e.target.value as Seo["schedule"] })}>
                  <option value="off">خاموش</option>
                  <option value="daily">روزانه</option>
                  <option value="weekly">هفتگی</option>
                </select>
              </label>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={seo.afterPublish} disabled={!write} onChange={(e) => setSeo({ ...seo, afterPublish: e.target.checked })} />
                <span>بعد از هر انتشار هم بررسی شود</span>
              </label>
              <label className="f">
                <span>حداقل امتیاز قابل قبول</span>
                <input type="number" min={0} max={100} value={seo.minScore} disabled={!write} onChange={(e) => setSeo({ ...seo, minScore: Number(e.target.value) })} />
              </label>
              <label className="f">
                <span>مسیرهای بیشتر برای بررسی (هر خط یکی، مثل /fa/forms/quote)</span>
                <textarea dir="ltr" rows={4} disabled={!write} value={seo.pages.join("\n")} onChange={(e) => setSeo({ ...seo, pages: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
              </label>
              <Updated u={s.data.updated.seo} />
              <div className="row">
                {write && (
                  <button className="btn primary" disabled={act.busy}>
                    ذخیره
                  </button>
                )}
                <Link className="btn" href="/seo">
                  گزارش‌های سئو
                </Link>
              </div>
            </div>
          </form>
        ) : (
          <>
            <section className="card" aria-label="گواهی SSL">
              <div className="card-head">
                <h2>گواهی SSL</h2>
                <SslBadge ssl={s.data.status.ssl} />
              </div>
              <div className="card-body stack small">
                <div>
                  سایت: <code dir="ltr">{s.data.status.env.siteUrl}</code>
                </div>
                {s.data.status.ssl.validTo && (
                  <div>
                    معتبر تا {new Date(s.data.status.ssl.validTo).toLocaleDateString("fa-IR")} ({s.data.status.ssl.daysLeft} روز) · صادرکننده: {s.data.status.ssl.issuer}
                  </div>
                )}
                {s.data.status.ssl.error && <div className="note bad">{s.data.status.ssl.error}</div>}
                <p className="muted">گواهی‌ها را Caddy خودکار از Let’s Encrypt می‌گیرد و پیش از انقضا تمدید می‌کند (infra/Caddyfile)؛ HSTS با preload روشن است. اگر کمتر از ۱۴ روز مانده، لاگ Caddy را بررسی کنید.</p>
              </div>
            </section>
            <section className="card" aria-label="سرآیندهای امنیتی">
              <div className="card-head">
                <h2>سرآیندهای امنیتی صفحهٔ اصلی</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {s.data.status.headers.map((h) => (
                      <tr key={h.name}>
                        <td>
                          <code dir="ltr">{h.name}</code>
                        </td>
                        <td>{h.present ? <span className="badge ok">هست</span> : <span className="badge bad">نیست</span>}</td>
                        <td className="small muted" dir="ltr" style={{ wordBreak: "break-all" }}>
                          {h.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card" aria-label="پیکربندی سرور">
              <div className="card-body stack small">
                <div>شبکه‌های مجاز کنسول: {s.data.status.env.consoleAllowlist.length ? <code dir="ltr">{s.data.status.env.consoleAllowlist.join(" ")}</code> : <span className="badge bad">همه‌جا (CONSOLE_ALLOWED_CIDRS خالی است)</span>}</div>
                <div>ضداسپم فرم‌ها (Turnstile): {s.data.status.env.turnstile ? <span className="badge ok">روشن</span> : <span className="badge warn">خاموش</span>}</div>
                <div>ایمیل (SMTP): {s.data.status.env.mail ? <span className="badge ok">روشن</span> : <span className="badge warn">خاموش</span>}</div>
                <div>اسکن ویروس فایل‌ها (ClamAV): {s.data.status.env.clamav ? <span className="badge ok">روشن</span> : <span className="badge warn">خاموش</span>}</div>
                <p className="muted">این موارد در infra/.env تنظیم می‌شوند و از کنسول قابل تغییر نیستند (عمداً).</p>
              </div>
            </section>
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                save("security", sec);
              }}
            >
              <div className="card-body stack">
                <h2>security.txt</h2>
                <Field label="ایمیل گزارش آسیب‌پذیری" type="email" value={sec.contactEmail} onChange={(v) => setSec({ ...sec, contactEmail: n(v) })} disabled={!write} />
                <Field label="نشانی سیاست افشای امنیتی (https)" value={sec.policyUrl} onChange={(v) => setSec({ ...sec, policyUrl: n(v) })} disabled={!write} />
                <Updated u={s.data.updated.security} />
                {write && (
                  <div>
                    <button className="btn primary" disabled={act.busy}>
                      ذخیره
                    </button>
                  </div>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}

function Field({ label, value, onChange, pattern, disabled, type = "text" }: { label: string; value: string | null; onChange: (v: string) => void; pattern?: string; disabled?: boolean; type?: string }) {
  return (
    <label className="f" style={{ flex: 1 }}>
      <span>{label}</span>
      <input dir="ltr" type={type} value={value ?? ""} pattern={pattern} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const Updated = ({ u }: { u?: { at: string; by: string | null } }) => (u ? <p className="small muted">آخرین تغییر: {ago(u.at)}</p> : null);

function SslBadge({ ssl }: { ssl: Settings["status"]["ssl"] }) {
  if (!ssl.https) return <span className="badge bad">بدون HTTPS</span>;
  if (ssl.error) return <span className="badge bad">مشکل دارد</span>;
  if ((ssl.daysLeft ?? 0) < 14) return <span className="badge warn">نزدیک انقضا</span>;
  return <span className="badge ok">معتبر</span>;
}
