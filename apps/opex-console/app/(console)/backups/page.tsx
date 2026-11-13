"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Kind = "full" | "content" | "database" | "media";
type Backup = { id: string; kind: Kind; trigger: string; status: string; bytes: number | null; sha256: string | null; remote: { at: string; to: string | null; ok: boolean; error: string | null }[]; error: string | null; created_at: string };
type Remote = { type: "none" | "ftp" | "ftps" | "sftp" | "s3" | "webdav"; host: string | null; port: number | null; user: string | null; password: string | null; path: string | null; endpoint: string | null; bucket: string | null; region: string | null; accessKey: string | null; secretKey: string | null };
type Config = { schedule: "off" | "daily" | "weekly"; hour: number; kind: Kind; keep: number; remote: Remote };

const KIND: Record<Kind, string> = { full: "کامل (پایگاه داده + رسانه)", content: "فقط محتوا (صفحه‌ها، فرم‌ها، تنظیمات)", database: "کل پایگاه داده (بدون فایل‌ها)", media: "فقط رسانه (فایل‌ها)" };
const TRIGGER: Record<string, string> = { manual: "دستی", schedule: "خودکار", pre_restore: "پیش از بازگردانی" };
const size = (b: number | null) => (b === null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const n = (v: string) => (v.trim() ? v.trim() : null);

/** S4: full backups with restore, a schedule, and copies to FTP, FTPS, SFTP, S3 or WebDAV. */
export default function Backups() {
  const me = useMe();
  const list = useApi<Backup[]>("/v1/manage/backups");
  const cfgApi = useApi<Config>("/v1/manage/backups/config");
  const act = useAction();
  const [kind, setKind] = useState<Kind>("full");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [restore, setRestore] = useState<{ id?: string; file?: File } | null>(null);
  const [scope, setScope] = useState<"all" | "content">("all");
  const [media, setMedia] = useState(true);
  const [confirm, setConfirm] = useState("");
  useEffect(() => setCfg(cfgApi.data), [cfgApi.data]);
  const run = can(me, "backup.run");
  const conf = can(me, "backup.configure");

  const make = () =>
    act.run(async () => {
      await api("/v1/manage/backups", { body: { kind, remote: true } });
      list.reload();
    }, "پشتیبان ساخته شد (رمزگذاری‌شده).");
  const download = (b: Backup) =>
    act.run(async () => {
      const r = await api<Response>(`/v1/manage/backups/${b.id}/download`, { raw: true });
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${b.id}.opexbak`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  const remove = (b: Backup) =>
    window.confirm("این پشتیبان برای همیشه حذف شود؟") &&
    act.run(async () => {
      await api(`/v1/manage/backups/${b.id}`, { method: "DELETE" });
      list.reload();
    }, "حذف شد.");
  const doRestore = () =>
    act.run(async () => {
      let r: { safety: string; tables: string[]; mediaFiles: number };
      if (restore?.file) r = await api(`/v1/manage/backups/restore?scope=${scope}&media=${media}&confirm=RESTORE`, { bytes: restore.file });
      else r = await api("/v1/manage/backups/restore", { body: { id: restore?.id, scope, media, confirm: "RESTORE" } });
      setRestore(null);
      setConfirm("");
      list.reload();
      return r;
    }, "بازگردانی انجام شد. یک پشتیبان ایمنی از وضعیت قبلی هم ساخته شد.");
  const saveCfg = (e: React.FormEvent) => {
    e.preventDefault();
    if (cfg)
      act.run(async () => {
        await api("/v1/manage/backups/config", { method: "PUT", body: cfg });
        cfgApi.reload();
      }, "تنظیمات پشتیبان ذخیره شد.");
  };
  const test = () =>
    act.run(async () => {
      const r = await api<{ ok: boolean; to: string | null; error: string | null }>("/v1/manage/backups/config/test", { method: "POST" });
      if (!r.ok) throw new Error(r.error ?? "ناموفق");
      return r;
    }, "اتصال برقرار شد و فایل آزمایشی فرستاده شد.");
  const r = cfg?.remote;
  const setR = (p: Partial<Remote>) => cfg && setCfg({ ...cfg, remote: { ...cfg.remote, ...p } });

  return (
    <>
      <PageHead title="پشتیبان‌گیری" sub="پشتیبان کامل سایت با امکان بازگردانی، زمان‌بندی خودکار و ارسال نسخه به FTP، SFTP، S3 یا WebDAV. همهٔ پشتیبان‌ها با AES-256 رمزگذاری می‌شوند.">
        {run && (
          <div className="row">
            <select aria-label="نوع پشتیبان" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KIND) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND[k]}
                </option>
              ))}
            </select>
            <button type="button" className="btn primary" disabled={act.busy} onClick={make}>
              پشتیبان بگیر
            </button>
          </div>
        )}
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error ?? list.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        <section className="card" aria-label="پشتیبان‌ها">
          <div className="card-head">
            <h2>پشتیبان‌های روی سرور</h2>
            {can(me, "backup.restore") && (
              <label className="btn sm">
                بازگردانی از فایل…
                <input type="file" accept=".opexbak" hidden onChange={(e) => e.target.files?.[0] && setRestore({ file: e.target.files[0] })} />
              </label>
            )}
          </div>
          {!list.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : !list.data.length ? (
            <div className="card-body muted">هنوز پشتیبانی گرفته نشده است.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>زمان</th>
                    <th>نوع</th>
                    <th>حجم</th>
                    <th>نسخهٔ بیرونی</th>
                    <th>کارها</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((b) => (
                    <tr key={b.id}>
                      <td className="small">
                        {ago(b.created_at)} <span className="muted">· {TRIGGER[b.trigger] ?? b.trigger}</span>
                      </td>
                      <td className="small">{KIND[b.kind]}</td>
                      <td className="small">{b.status === "done" ? size(b.bytes) : b.status === "running" ? <span className="badge">در حال ساخت</span> : <span className="badge bad" title={b.error ?? ""}>ناموفق</span>}</td>
                      <td className="small">{b.remote.length ? b.remote.map((x, i) => (x.ok ? <span key={i} className="badge ok" title={x.to ?? ""}>فرستاده شد</span> : <span key={i} className="badge bad" title={x.error ?? ""}>نشد</span>)) : <span className="muted">—</span>}</td>
                      <td>
                        {b.status === "done" && (
                          <div className="row">
                            {run && (
                              <button type="button" className="btn sm" onClick={() => download(b)}>
                                دانلود
                              </button>
                            )}
                            {can(me, "backup.restore") && (
                              <button type="button" className="btn sm danger" onClick={() => setRestore({ id: b.id })}>
                                بازگردانی
                              </button>
                            )}
                            {run && (
                              <button type="button" className="btn sm" onClick={() => remove(b)}>
                                حذف
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {cfg && r && (
          <form className="card" onSubmit={saveCfg} aria-label="پشتیبان خودکار و ارسال">
            <div className="card-head">
              <h2>پشتیبان خودکار و ارسال به سرور دیگر</h2>
            </div>
            <div className="card-body stack">
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="f">
                  <span>زمان‌بندی</span>
                  <select value={cfg.schedule} disabled={!conf} onChange={(e) => setCfg({ ...cfg, schedule: e.target.value as Config["schedule"] })}>
                    <option value="off">خاموش</option>
                    <option value="daily">روزانه</option>
                    <option value="weekly">هفتگی</option>
                  </select>
                </label>
                <label className="f">
                  <span>ساعت (به وقت سرور)</span>
                  <input type="number" min={0} max={23} value={cfg.hour} disabled={!conf} onChange={(e) => setCfg({ ...cfg, hour: Number(e.target.value) })} />
                </label>
                <label className="f">
                  <span>نوع</span>
                  <select value={cfg.kind} disabled={!conf} onChange={(e) => setCfg({ ...cfg, kind: e.target.value as Kind })}>
                    {(Object.keys(KIND) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>تعداد نگه‌داری روی سرور</span>
                  <input type="number" min={1} max={365} value={cfg.keep} disabled={!conf} onChange={(e) => setCfg({ ...cfg, keep: Number(e.target.value) })} />
                </label>
              </div>
              <label className="f">
                <span>ارسال نسخه به</span>
                <select value={r.type} disabled={!conf} onChange={(e) => setR({ type: e.target.value as Remote["type"] })}>
                  <option value="none">هیچ‌جا (فقط روی سرور)</option>
                  <option value="sftp">SFTP (پیشنهادی)</option>
                  <option value="ftps">FTPS (FTP رمزگذاری‌شده)</option>
                  <option value="ftp">FTP (بدون رمزگذاری انتقال)</option>
                  <option value="s3">S3 سازگار (AWS، آروان، MinIO، R2)</option>
                  <option value="webdav">WebDAV (Nextcloud و …)</option>
                </select>
              </label>
              {r.type === "ftp" && <div className="note warn">FTP رمز عبور را بدون رمزگذاری می‌فرستد. فایل پشتیبان خودش رمزگذاری شده است، ولی SFTP یا FTPS امن‌ترند.</div>}
              {(r.type === "ftp" || r.type === "ftps" || r.type === "sftp") && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Text label="میزبان" value={r.host} onChange={(v) => setR({ host: n(v) })} disabled={!conf} />
                  <label className="f">
                    <span>پورت</span>
                    <input dir="ltr" type="number" value={r.port ?? ""} disabled={!conf} onChange={(e) => setR({ port: e.target.value ? Number(e.target.value) : null })} />
                  </label>
                  <Text label="نام کاربری" value={r.user} onChange={(v) => setR({ user: n(v) })} disabled={!conf} />
                  <Text label="رمز عبور" type="password" value={r.password} onChange={(v) => setR({ password: n(v) })} disabled={!conf} />
                </div>
              )}
              {r.type === "s3" && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Text label="Endpoint (https، برای AWS خالی)" value={r.endpoint} onChange={(v) => setR({ endpoint: n(v) })} disabled={!conf} />
                  <Text label="Bucket" value={r.bucket} onChange={(v) => setR({ bucket: n(v) })} disabled={!conf} />
                  <Text label="Region" value={r.region} onChange={(v) => setR({ region: n(v) })} disabled={!conf} />
                  <Text label="Access key" value={r.accessKey} onChange={(v) => setR({ accessKey: n(v) })} disabled={!conf} />
                  <Text label="Secret key" type="password" value={r.secretKey} onChange={(v) => setR({ secretKey: n(v) })} disabled={!conf} />
                </div>
              )}
              {r.type === "webdav" && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Text label="نشانی WebDAV (https)" value={r.endpoint} onChange={(v) => setR({ endpoint: n(v) })} disabled={!conf} />
                  <Text label="نام کاربری" value={r.user} onChange={(v) => setR({ user: n(v) })} disabled={!conf} />
                  <Text label="رمز عبور" type="password" value={r.password} onChange={(v) => setR({ password: n(v) })} disabled={!conf} />
                </div>
              )}
              {r.type !== "none" && <Text label="پوشهٔ مقصد" value={r.path} onChange={(v) => setR({ path: n(v) })} disabled={!conf} />}
              <p className="small muted">رمزها رمزگذاری‌شده ذخیره می‌شوند و دیگر نمایش داده نمی‌شوند (••••••). کلید رمزگذاری پشتیبان‌ها (BACKUP_KEY) را بیرون از سرور هم نگه دارید؛ بدون آن بازگردانی ممکن نیست.</p>
              {conf && (
                <div className="row">
                  <button className="btn primary" disabled={act.busy}>
                    ذخیره
                  </button>
                  {r.type !== "none" && (
                    <button type="button" className="btn" disabled={act.busy} onClick={test}>
                      آزمایش اتصال
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        )}
      </div>

      <Dialog open={!!restore} onClose={() => setRestore(null)} title="بازگردانی پشتیبان">
        <div className="stack">
          <div className="note bad">بازگردانی داده‌های فعلی را جایگزین می‌کند. پیش از آن یک پشتیبان ایمنی کامل ساخته می‌شود. اگر کاربران بازگردانده شوند همه از کنسول خارج می‌شوند. گزارش رویدادها هرگز بازنویسی نمی‌شود.</div>
          <p className="small">{restore?.file ? `فایل: ${restore.file.name}` : `پشتیبان: ${restore?.id}`}</p>
          <label className="f">
            <span>چه چیزی بازگردانده شود</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "content")}>
              <option value="all">همه (محتوا، کاربران، تیکت‌ها، شرکا …)</option>
              <option value="content">فقط محتوا (صفحه‌ها، فرم‌ها، تنظیمات)</option>
            </select>
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={media} onChange={(e) => setMedia(e.target.checked)} />
            <span>فایل‌های رسانه هم بازگردانده شوند</span>
          </label>
          <label className="f">
            <span>برای تأیید RESTORE بنویسید</span>
            <input dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <ErrorNote error={act.error} />
          <div className="row">
            <button type="button" className="btn danger" disabled={confirm !== "RESTORE" || act.busy} onClick={doRestore}>
              بازگردانی
            </button>
            <button type="button" className="btn" onClick={() => setRestore(null)}>
              انصراف
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function Text({ label, value, onChange, disabled, type = "text" }: { label: string; value: string | null; onChange: (v: string) => void; disabled?: boolean; type?: string }) {
  return (
    <label className="f" style={{ flex: 1, minInlineSize: 180 }}>
      <span>{label}</span>
      <input dir="ltr" type={type} autoComplete="off" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
