/** Console copy (Persian) and small formatters. */
export const ROLE: Record<string, string> = { super_admin: "مدیر ارشد", operator: "اپراتور", auditor: "حسابرس", viewer: "بیننده" };
export const LOCALE_LABEL: Record<string, string> = { fa: "فارسی", en: "English", tr: "Türkçe" };
export const RESULT: Record<string, string> = { success: "موفق", failure: "ناموفق", denied: "رد شد" };

const dt = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
export const when = (v: string | Date | null | undefined) => (v ? dt.format(new Date(v)) : "—");
const rel = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });
export function ago(v: string | Date | null | undefined) {
  if (!v) return "—";
  const s = (new Date(v).getTime() - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return rel.format(Math.round(s), "second");
  if (a < 3600) return rel.format(Math.round(s / 60), "minute");
  if (a < 86400) return rel.format(Math.round(s / 3600), "hour");
  return rel.format(Math.round(s / 86400), "day");
}
export const num = (n: number | string | null | undefined) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("fa-IR").format(Number(n)));
export const bytes = (n: number) => (n < 1024 ? `${num(n)} B` : n < 1048576 ? `${num(Math.round(n / 1024))} KB` : `${num(Math.round(n / 104857.6) / 10)} MB`);

/** Human labels for audit actions. */
export const ACTION: Record<string, string> = {
  "auth.login.success": "ورود",
  "auth.login.failure": "ورود ناموفق",
  "auth.password.ok": "رمز درست (در انتظار کد)",
  "auth.mfa.enrolled": "فعال‌سازی احراز دومرحله‌ای",
  "auth.mfa.enroll_started": "شروع فعال‌سازی احراز دومرحله‌ای",
  "auth.mfa.failure": "کد نادرست",
  "auth.step_up": "تأیید دوباره هویت",
  "auth.step_up.failure": "تأیید دوباره ناموفق",
  "auth.logout": "خروج",
  "auth.lockout": "قفل شدن حساب",
  "auth.password.changed": "تغییر رمز",
  "authz.denied": "دسترسی رد شد",
  "session.revoke": "پایان نشست",
  "operator.create": "ساخت کاربر",
  "operator.update": "ویرایش کاربر",
  "operator.permissions": "تغییر دسترسی‌های کاربر",
  "operator.password_reset": "رمز موقت تازه",
  "operator.sessions_revoked": "خروج از همهٔ دستگاه‌ها",
  "operator.delete": "حذف کاربر",
  "partner.create": "ساخت شریک",
  "partner.update": "ویرایش شریک",
  "partner.keys_rotated": "چرخش کلیدهای شریک",
  "partner_user.create": "ساخت کاربر شریک",
  "partner_user.update": "ویرایش کاربر شریک",
  "content.revision.create": "ذخیرهٔ پیش‌نویس",
  "content.publish": "انتشار",
  "content.rollback": "بازگشت به نسخهٔ قبل",
  "content.schedule": "زمان‌بندی انتشار",
  "content.unschedule": "لغو زمان‌بندی",
  "content.preview": "پیش‌نمایش پیش‌نویس",
  "cr.submitted": "ثبت درخواست تغییر",
  "cr.policy_decision": "تصمیم سیاست تأیید",
  "cr.pending_review": "درخواست در انتظار بررسی",
  "cr.approved": "تأیید درخواست تغییر",
  "cr.approval_recorded": "ثبت تأیید (دو نفره)",
  "cr.published": "انتشار درخواست تغییر",
  "cr.rejected": "رد درخواست تغییر",
  "cr.withdrawn": "پس گرفتن درخواست",
  "cr.needs_rebase": "درخواست نیازمند به‌روزرسانی",
  "cr.submitted_again": "ارسال دوباره",
  "cr.amended": "اصلاح درخواست توسط اپراتور",
  "cr.expired": "انقضای درخواست",
  "grant.create": "ایجاد دسترسی",
  "grant.delete": "حذف دسترسی",
  "policy.create": "ایجاد سیاست تأیید",
  "policy.update": "ویرایش سیاست تأیید",
  "policy.delete": "حذف سیاست تأیید",
  "partner.webhook_set": "تنظیم وب‌هوک شریک",
  "webhook.retry": "ارسال دوباره وب‌هوک",
  "inquiry.received": "درخواست تازه از سایت",
  "inquiry.list": "دیدن فهرست درخواست‌های سایت",
  "inquiry.read": "دیدن یک درخواست سایت",
  "inquiry.handled": "پیگیری درخواست سایت",
  "inquiry.reopened": "بازکردن دوبارهٔ درخواست سایت",
  "inquiry.erased": "حذف درخواست سایت",
  "inquiry.purged": "حذف خودکار درخواست‌های قدیمی",
  "ticket.created": "تیکت تازه",
  "ticket.list": "دیدن فهرست تیکت‌ها",
  "ticket.read": "باز کردن تیکت",
  "ticket.updated": "تغییر تیکت",
  "ticket.assigned": "تعیین مسئول تیکت",
  "ticket.referred": "ارجاع تیکت",
  "ticket.transferred": "انتقال تیکت",
  "ticket.note": "یادداشت داخلی",
  "ticket.replied": "پاسخ به مشتری",
  "ticket.customer_reply": "پاسخ مشتری (ایمیل)",
  "ticket.merged": "ادغام تیکت",
  "ticket.erased": "حذف تیکت",
  "ticket.purged": "حذف خودکار تیکت‌های قدیمی",
  "ticket.imported": "انتقال درخواست قدیمی به تیکت",
  "ticket.attachment_read": "دریافت پیوست تیکت",
  "form.created": "ساخت فرم",
  "form.draft_saved": "ذخیرهٔ پیش‌نویس فرم",
  "form.published": "انتشار فرم",
  "form.archived": "بایگانی فرم",
  "form.restored": "بازگردانی فرم",
  "form.version_read": "دیدن نسخهٔ فرم",
  "team.created": "ساخت تیم",
  "team.updated": "تغییر تیم",
  "team.members": "تغییر اعضای تیم",
  "team.deleted": "حذف تیم",
  "saved_reply.created": "ساخت پاسخ آماده",
  "saved_reply.updated": "تغییر پاسخ آماده",
  "saved_reply.deleted": "حذف پاسخ آماده",
  "render.queued": "رندر سه‌بعدی در صف",
  "render.started": "شروع رندر سه‌بعدی",
  "render.completed": "پایان رندر سه‌بعدی",
  "render.failed": "رندر سه‌بعدی ناموفق",
  "audit.archived": "بایگانی گزارش (غیرقابل‌تغییر)",
  "site.revalidate": "به‌روزرسانی همهٔ صفحه‌های سایت",
  "content.entry.create": "ساخت محتوا",
  "oauth.login.success": "ورود از آراسی‌ام‌اس",
  "oauth.login.failure": "ورود ناموفق آراسی‌ام‌اس",
  "oauth.mfa.failure": "کد نادرست آراسی‌ام‌اس",
  "oauth.token.issued": "صدور توکن",
  "oauth.token.refreshed": "تمدید توکن",
  "oauth.token.revoked": "ابطال توکن",
  "oauth.token.failure": "درخواست توکن ناموفق",
  "oauth.refresh.reuse_detected": "استفادهٔ دوباره از توکن (هشدار)",
  "media.upload": "بارگذاری رسانه",
  "media.rejected": "رسانهٔ ردشده",
  "audit.verify": "بررسی زنجیرهٔ گزارش",
  "audit.export": "خروجی گزارش",
};
export const actionLabel = (a: string) => ACTION[a] ?? a;

/** Helpdesk labels (P11). */
export const STATUS: Record<string, [string, string]> = {
  new: ["تازه", "accent"],
  open: ["باز", "ok"],
  pending: ["در انتظار مشتری", "warn"],
  on_hold: ["معلق", ""],
  resolved: ["حل‌شده", ""],
  closed: ["بسته", ""],
  spam: ["هرزنامه", "bad"],
};
export const PRIORITY: Record<string, [string, string]> = { low: ["کم", ""], normal: ["عادی", ""], high: ["زیاد", "warn"], urgent: ["فوری", "bad"] };
export const VIEW_LABEL: Record<string, string> = { mine: "مال من", unassigned: "بدون مسئول", teams: "تیم‌های من", all: "همهٔ باز", overdue: "عقب از SLA", waiting: "در انتظار مشتری", closed: "حل‌شده و بسته", spam: "هرزنامه" };
/** "in 3 h" / "2 h late". */
export function dueIn(v: string | null | undefined) {
  if (!v) return "";
  const m = Math.round((new Date(v).getTime() - Date.now()) / 60_000);
  const a = Math.abs(m);
  const t = a < 60 ? `${num(a)} دقیقه` : a < 48 * 60 ? `${num(Math.round(a / 60))} ساعت` : `${num(Math.round(a / 1440))} روز`;
  return m >= 0 ? `${t} مانده` : `${t} تأخیر`;
}
