"use client";

import Link from "next/link";
import { num, when } from "@/lib/fa";

export type Level = "ok" | "warn" | "fail";
export type Overview = {
  generatedAt: string;
  score: number;
  services: { id: "database" | "website" | "scanner" | "mail" | "renderer"; ok: boolean; latencyMs: number | null; detail: string | null }[];
  host: { memTotalBytes: number; memAvailableBytes: number; swapTotalBytes: number; swapFreeBytes: number; cpus: number; load: number[]; uptimeSeconds: number; apiRssBytes: number; apiUptimeSeconds: number; node: string };
  disks: { id: string; path: string; totalBytes: number; freeBytes: number }[];
  storage: { databaseBytes: number; mediaBytes: number; mediaFiles: number; backupsBytes: number; backupFiles: number; auditEvents: number };
  activity: {
    entries: number;
    published: number;
    drafts: number;
    assets: number;
    assetBytes: number;
    ticketsOpen: number;
    ticketsWeek: number;
    operators: number;
    lockedOperators: number;
    lastBackupAt: string | null;
    lastBackupBytes: number | null;
    lastSeoAt: string | null;
    lastSeoScore: number | null;
    lastRenderAt: string | null;
  };
  ssl: { https: boolean; validTo: string | null; issuer: string | null; daysLeft: number | null; error: string | null };
  checks: { id: string; area: "security" | "reliability" | "performance" | "seo" | "operations"; level: Level; value: string | null }[];
};

/** Sizes in Persian digits, up to GB. */
export const size = (n: number) => {
  const u = ["بایت", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${num(i === 0 ? v : Math.round(v * 10) / 10)} ${u[i]}`;
};
const duration = (s: number) => (s >= 86400 ? `${num(Math.floor(s / 86400))} روز` : s >= 3600 ? `${num(Math.floor(s / 3600))} ساعت` : `${num(Math.max(1, Math.floor(s / 60)))} دقیقه`);

const SERVICE: Record<Overview["services"][number]["id"], [string, string]> = {
  database: ["پایگاه داده", "محتوا، کاربران، تیکت‌ها و گزارش رویدادها"],
  website: ["سایت", "پاسخ صفحهٔ اصلی فارسی"],
  scanner: ["اسکنر ویروس (ClamAV)", "بررسی فایل‌های آپلودی و پیوست فرم‌ها"],
  mail: ["ایمیل خروجی (SMTP)", "اعلان فرم‌ها و پاسخ به مشتری"],
  renderer: ["رندرر سه‌بعدی", "تصاویر محصول از صحنهٔ خود سایت"],
};

const AREA: Record<Overview["checks"][number]["area"], string> = {
  security: "امنیت",
  reliability: "پشتیبان‌گیری و پایداری",
  operations: "صف‌ها و سرویس‌ها",
  performance: "منابع و سرعت",
  seo: "سئو و آنالیتیکس",
};

/** Title, what to do when it is not ok, and where to fix it. `{v}` is the check's value. */
const CHECK: Record<string, { title: string; fix: string; href?: string }> = {
  "ssl.valid": { title: "گواهی SSL معتبر", fix: "گواهی خطا دارد یا کمتر از ۱۴ روز اعتبار دارد. دامنه باید به همین سرور اشاره کند تا Caddy خودش تمدید کند." },
  "headers.security": { title: "هدرهای امنیتی سایت", fix: "این هدرها روی صفحهٔ اصلی نیستند: {v}" },
  "console.allowlist": { title: "محدودیت شبکهٔ کنسول", fix: "کنسول از همهٔ اینترنت باز است. IP دفتر یا VPN را در CONSOLE_ALLOW بگذارید (sudo arapoush config)." },
  "operators.mfa": { title: "ورود دومرحله‌ای همهٔ اپراتورها", fix: "{v} اپراتور هنوز اپلیکیشن احراز هویت را فعال نکرده‌اند.", href: "/operators" },
  "operators.admins": { title: "تعداد مدیران ارشد (۱ تا ۳)", fix: "{v} مدیر ارشد دارید؛ دسترسی کامل را به کمترین افراد بدهید.", href: "/operators" },
  "forms.turnstile": { title: "ضد اسپم فرم‌ها (Turnstile)", fix: "TURNSTILE_SECRET تنظیم نشده؛ فرم‌ها فقط با محدودیت نرخ محافظت می‌شوند." },
  "uploads.scanner": { title: "اسکن ویروس آپلودها", fix: "اسکنر در دسترس نیست؛ آپلودها بدون اسکن رد یا پذیرفته می‌شوند." },
  "backups.recent": { title: "پشتیبان تازه (کمتر از ۴۸ ساعت)", fix: "آخرین پشتیبان موفق {v} ساعت پیش بوده یا هنوز نیست.", href: "/backups" },
  "backups.schedule": { title: "پشتیبان‌گیری خودکار", fix: "زمان‌بندی خاموش است.", href: "/backups" },
  "backups.offsite": { title: "نسخهٔ پشتیبان بیرون از سرور", fix: "مقصد دوم (FTP، SFTP، S3 یا WebDAV) تعریف نشده یا آخرین ارسال ناموفق بوده.", href: "/backups" },
  "backups.key": { title: "کلید جدای رمزنگاری پشتیبان", fix: "BACKUP_KEY تنظیم نشده و کلید از INQUIRY_KEY ساخته می‌شود؛ چرخش آن کلید پشتیبان‌های قبلی را بی‌استفاده می‌کند." },
  "audit.archive": { title: "بایگانی غیرقابل‌تغییر گزارش رویدادها", fix: "AUDIT_ARCHIVE_DIR تنظیم نشده.", href: "/audit" },
  "mail.smtp": { title: "ارسال ایمیل", fix: "SMTP_URL تنظیم نشده؛ اعلان‌ها در صف می‌مانند." },
  "mail.queue": { title: "صف ایمیل", fix: "در صف / ناموفق قطعی: {v}" },
  "webhooks.queue": { title: "صف وب‌هوک‌ها", fix: "در صف / ناموفق قطعی (۷ روز): {v}", href: "/webhooks" },
  "render.queue": { title: "صف رندر سه‌بعدی", fix: "در صف / ناموفق (۷ روز): {v}", href: "/catalogue" },
  "memory.available": { title: "حافظهٔ آزاد سرور", fix: "فقط {v}٪ حافظه آزاد است." },
  "memory.swap": { title: "حافظهٔ Swap", fix: "سرور Swap ندارد ({v} MB)؛ در اوج مصرف، سرویس‌ها ممکن است بسته شوند. نصب‌کننده Swap اضافه می‌کند." },
  "disk.free": { title: "فضای آزاد دیسک", fix: "فقط {v}٪ دیسک آزاد است." },
  "site.response": { title: "زمان پاسخ سایت", fix: "پاسخ صفحهٔ اصلی {v} میلی‌ثانیه طول کشید." },
  "seo.indexing": { title: "اجازهٔ ایندکس", fix: "ایندکس خاموش است و همهٔ صفحه‌ها noindex دارند." },
  "seo.score": { title: "امتیاز موتور سئو", fix: "امتیاز آخرین بررسی: {v}", href: "/seo" },
  "seo.verification": { title: "تأیید مالکیت در کنسول جستجو", fix: "کد Google Search Console یا Bing وارد نشده." },
  "analytics.installed": { title: "آنالیتیکس", fix: "هیچ ابزار آماری فعال نیست." },
  "security.contact": { title: "security.txt (تماس امنیتی)", fix: "ایمیل گزارش آسیب‌پذیری وارد نشده." },
};

const LEVEL: Record<Level, [string, string]> = { ok: ["سالم", "ok"], warn: ["هشدار", "warn"], fail: ["مشکل", "bad"] };
const order: Record<Level, number> = { fail: 0, warn: 1, ok: 2 };

function Bar({ label, used, total, detail }: { label: string; used: number; total: number; detail: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const tone = pct >= 90 ? "bad" : pct >= 80 ? "warn" : "ok";
  return (
    <div className="ov-bar">
      <div className="row ov-bar-head">
        <span>{label}</span>
        <span className="muted small">{detail}</span>
      </div>
      <div className="ov-track" role="img" aria-label={`${label}: ${num(pct)}٪ در حال استفاده`}>
        <span className="ov-fill" data-tone={tone} style={{ inlineSize: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Checks fixed on another tab of the settings page itself. */
const SETTINGS_TAB: Record<string, string> = { "seo.indexing": "seo", "seo.verification": "analytics", "analytics.installed": "analytics", "security.contact": "security", "ssl.valid": "security", "headers.security": "security" };

export default function SystemOverview({ data, onRefresh, busy, onSettingsTab }: { data: Overview; onRefresh: () => void; busy?: boolean; onSettingsTab?: (tab: string) => void }) {
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const c of data.checks) counts[c.level]++;
  const tone = data.score >= 85 ? "ok" : data.score >= 65 ? "warn" : "bad";
  const h = data.host;
  const memUsed = h.memTotalBytes - h.memAvailableBytes;
  const swapUsed = h.swapTotalBytes - h.swapFreeBytes;
  const s = data.storage;
  const total = s.databaseBytes + s.mediaBytes + s.backupsBytes;
  const groups = (Object.keys(AREA) as (keyof typeof AREA)[]).map((area) => ({ area, items: data.checks.filter((c) => c.area === area).sort((a, b) => order[a.level] - order[b.level]) }));
  // Numbers in Persian digits; "3/1" style pairs and names as they are.
  const shown = (v: string | null) => (v === null ? "—" : /^\d+$/.test(v) ? num(Number(v)) : v.replace(/\d+/g, (d) => num(Number(d))));
  const fixText = (c: Overview["checks"][number]) => (CHECK[c.id]?.fix ?? "").replace("{v}", shown(c.value));

  return (
    <div className="grid ov">
      {/* Score and summary */}
      <section className="card ov-head" aria-labelledby="ov-score">
        <div className="card-body ov-head-body">
          <div className="ov-score" data-tone={tone}>
            <span id="ov-score" className="ov-score-n">
              {num(data.score)}
            </span>
            <span className="ov-score-k">امتیاز سلامت</span>
          </div>
          <div className="stack ov-head-text">
            <p className="ov-head-title">{counts.fail ? `${num(counts.fail)} مورد نیاز به رسیدگی دارد` : counts.warn ? "سالم است؛ چند پیشنهاد برای بهتر شدن" : "همه‌چیز سالم است"}</p>
            <div className="row">
              <span className="badge bad">{num(counts.fail)} مشکل</span>
              <span className="badge warn">{num(counts.warn)} هشدار</span>
              <span className="badge ok">{num(counts.ok)} سالم</span>
            </div>
            <p className="small muted">آخرین بررسی: {when(data.generatedAt)} · هر یک دقیقه خودکار به‌روز می‌شود</p>
          </div>
          <button type="button" className="btn" onClick={onRefresh} disabled={busy} aria-busy={busy}>
            {busy ? "در حال بررسی…" : "بررسی دوباره"}
          </button>
        </div>
      </section>

      {/* Services */}
      <section aria-labelledby="ov-services">
        <h2 id="ov-services" className="ov-h">
          سرویس‌ها
        </h2>
        <ul className="ov-services plain">
          {data.services.map((sv) => (
            <li key={sv.id} className="card ov-service" data-ok={sv.ok}>
              <span className="ov-dot" data-ok={sv.ok} aria-hidden="true" />
              <div className="stack ov-service-text">
                <strong>{SERVICE[sv.id][0]}</strong>
                <span className="small muted">{SERVICE[sv.id][1]}</span>
              </div>
              <div className="ov-service-state">
                <span className={`badge ${sv.ok ? "ok" : "bad"}`}>{sv.ok ? "فعال" : "مشکل"}</span>
                {sv.latencyMs !== null && <span className="small muted">{num(sv.latencyMs)} ms</span>}
                {!sv.ok && sv.detail && (
                  <span className="small muted" dir="ltr">
                    {sv.detail}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="ov-cols">
        {/* Resources */}
        <section className="card" aria-labelledby="ov-res">
          <div className="card-body stack">
            <h2 id="ov-res" className="ov-h">
              منابع سرور
            </h2>
            <Bar label="حافظه (RAM)" used={memUsed} total={h.memTotalBytes} detail={`${size(memUsed)} از ${size(h.memTotalBytes)} · آزاد ${size(h.memAvailableBytes)}`} />
            {h.swapTotalBytes > 0 ? <Bar label="Swap" used={swapUsed} total={h.swapTotalBytes} detail={`${size(swapUsed)} از ${size(h.swapTotalBytes)}`} /> : <p className="note warn small">سرور حافظهٔ Swap ندارد.</p>}
            {data.disks.map((d) => (
              <Bar key={d.id} label={d.id === "data" ? "دیسک (داده‌ها)" : "دیسک (پشتیبان‌ها)"} used={d.totalBytes - d.freeBytes} total={d.totalBytes} detail={`آزاد ${size(d.freeBytes)} از ${size(d.totalBytes)}`} />
            ))}
            <dl className="ov-dl">
              <div>
                <dt>پردازنده</dt>
                <dd>
                  {num(h.cpus)} هسته · بار {h.load.map((x) => num(x)).join(" / ")}
                </dd>
              </div>
              <div>
                <dt>روشن بودن سرور</dt>
                <dd>{duration(h.uptimeSeconds)}</dd>
              </div>
              <div>
                <dt>حافظهٔ API</dt>
                <dd>
                  {size(h.apiRssBytes)} · {duration(h.apiUptimeSeconds)} بدون ری‌استارت
                </dd>
              </div>
            </dl>
            <p className="small muted">
              مصرف هر سرویس جداگانه (سایت، کنسول، ClamAV، رندرر) را روی سرور با <kbd>sudo arapoush status</kbd> ببینید؛ API به‌عمد به Docker دسترسی ندارد.
            </p>
          </div>
        </section>

        {/* Storage */}
        <section className="card" aria-labelledby="ov-storage">
          <div className="card-body stack">
            <h2 id="ov-storage" className="ov-h">
              فضای ذخیره‌شده
            </h2>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">حجم هر بخش از داده‌های پلتفرم</caption>
                <tbody>
                  <tr>
                    <th scope="row">پایگاه داده</th>
                    <td>{size(s.databaseBytes)}</td>
                    <td className="muted small">{num(s.auditEvents)} رویداد در گزارش</td>
                  </tr>
                  <tr>
                    <th scope="row">رسانه‌ها</th>
                    <td>{size(s.mediaBytes)}</td>
                    <td className="muted small">{num(s.mediaFiles)} فایل</td>
                  </tr>
                  <tr>
                    <th scope="row">پشتیبان‌ها</th>
                    <td>{size(s.backupsBytes)}</td>
                    <td className="muted small">{num(s.backupFiles)} فایل</td>
                  </tr>
                  <tr className="ov-total">
                    <th scope="row">مجموع داده‌ها</th>
                    <td>{size(total)}</td>
                    <td className="muted small">بدون ایمیج‌های Docker</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="small muted">ایمیج‌های برنامه حدود ۶ گیگابایت می‌گیرند. برای نصب و به‌روزرسانی دست‌کم ۱۵ گیگابایت فضای آزاد لازم است.</p>
          </div>
        </section>
      </div>

      {/* Activity */}
      <section aria-labelledby="ov-act">
        <h2 id="ov-act" className="ov-h">
          فعالیت
        </h2>
        <div className="stats">
          <div className="card stat">
            <div className="k">محتوا</div>
            <div className="v">{num(data.activity.entries)}</div>
            <div className="s">
              {num(data.activity.published)} منتشرشده · {num(data.activity.drafts)} پیش‌نویس باز
            </div>
          </div>
          <div className="card stat">
            <div className="k">رسانه</div>
            <div className="v">{num(data.activity.assets)}</div>
            <div className="s">{size(data.activity.assetBytes)}</div>
          </div>
          <div className="card stat" data-tone={data.activity.ticketsOpen > 20 ? "warn" : undefined}>
            <div className="k">تیکت‌های باز</div>
            <div className="v">{num(data.activity.ticketsOpen)}</div>
            <div className="s">{num(data.activity.ticketsWeek)} تیکت در ۷ روز</div>
          </div>
          <div className="card stat" data-tone={data.activity.lockedOperators ? "warn" : undefined}>
            <div className="k">اپراتورها</div>
            <div className="v">{num(data.activity.operators)}</div>
            <div className="s">{data.activity.lockedOperators ? `${num(data.activity.lockedOperators)} قفل‌شده` : "بدون حساب قفل‌شده"}</div>
          </div>
          <div className="card stat" data-tone={data.activity.lastBackupAt ? undefined : "bad"}>
            <div className="k">آخرین پشتیبان</div>
            <div className="v ov-v-sm">{data.activity.lastBackupAt ? when(data.activity.lastBackupAt) : "هنوز نیست"}</div>
            <div className="s">{data.activity.lastBackupBytes ? size(data.activity.lastBackupBytes) : ""}</div>
          </div>
          <div className="card stat">
            <div className="k">آخرین بررسی سئو</div>
            <div className="v">{data.activity.lastSeoScore === null ? "—" : num(data.activity.lastSeoScore)}</div>
            <div className="s">{data.activity.lastSeoAt ? when(data.activity.lastSeoAt) : "هنوز اجرا نشده"}</div>
          </div>
        </div>
      </section>

      {/* Checks */}
      <section aria-labelledby="ov-checks">
        <h2 id="ov-checks" className="ov-h">
          بررسی بهترین‌روش‌ها
        </h2>
        <div className="ov-groups">
          {groups.map((g) => (
            <section key={g.area} className="card" aria-labelledby={`ov-a-${g.area}`}>
              <div className="card-body stack">
                <h3 id={`ov-a-${g.area}`} className="ov-h3">
                  {AREA[g.area]}
                </h3>
                <ul className="plain ov-checks">
                  {g.items.map((c) => {
                    const meta = CHECK[c.id];
                    const tab = SETTINGS_TAB[c.id];
                    return (
                      <li key={c.id} className="ov-check" data-level={c.level}>
                        <span className={`badge ${LEVEL[c.level][1]}`}>{LEVEL[c.level][0]}</span>
                        <div className="stack ov-check-text">
                          <span>{meta?.title ?? c.id}</span>
                          {c.level !== "ok" && meta?.fix && <span className="small muted">{fixText(c)}</span>}
                        </div>
                        {c.level !== "ok" && meta?.href ? (
                          <Link className="btn sm" href={meta.href} aria-label={`رفع: ${meta.title}`}>
                            رفع
                          </Link>
                        ) : c.level !== "ok" && tab && onSettingsTab ? (
                          <button type="button" className="btn sm" onClick={() => onSettingsTab(tab)} aria-label={`رفع: ${meta?.title ?? c.id}`}>
                            رفع
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
