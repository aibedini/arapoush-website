"use client";

import { useEffect, useRef } from "react";
import type { ApiError } from "@/lib/api";

/** Native <dialog>: focus trap, Esc and backdrop for free. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={wide ? "wide" : undefined} onClose={onClose} aria-label={title}>
      {open && (
        <>
          <div className="d-head">
            <h2>{title}</h2>
            <button type="button" className="btn ghost sm" onClick={onClose}>
              بستن
            </button>
          </div>
          <div className="d-body">{children}</div>
          {footer && <div className="d-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

const MESSAGES: Record<string, string> = {
  CONFLICT_BASE_REVISION: "این محتوا در این فاصله توسط کس دیگری تغییر کرده است. صفحه را تازه کنید و تغییرات را دوباره اعمال کنید.",
  FIELD_LOCKED: "این فیلد قفل است و فقط مدیر ارشد با تأیید دوباره می‌تواند آن را تغییر دهد.",
  ROLE_DENIED: "دسترسی شما اجازهٔ این کار را نمی‌دهد.",
  STEP_UP_REQUIRED: "این کار به تأیید دوبارهٔ هویت نیاز دارد.",
  NETWORK_DENIED: "دسترسی به کنسول از این شبکه مجاز نیست.",
  WEAK_PASSWORD: "رمز عبور به اندازهٔ کافی قوی نیست.",
  EMAIL_TAKEN: "حسابی با این ایمیل وجود دارد.",
  MEDIA_REJECTED: "فایل پذیرفته نشد.",
  SELF_CHANGE: "این تغییر را نمی‌توانید روی حساب خودتان انجام دهید (از صفحهٔ «حساب من» یا با کمک مدیر دیگر).",
  ESCALATION: "نمی‌توانید دسترسی‌ای را بدهید که خودتان ندارید، یا کاربری را تغییر دهید که دسترسی بیشتری از شما دارد.",
  LAST_ADMIN: "این آخرین مدیر ارشد فعال است و نمی‌توان نقشش را گرفت، غیرفعال یا حذفش کرد.",
  PASSWORD_CHANGE_REQUIRED: "با رمز موقت وارد شده‌اید؛ اول رمز خودتان را در «حساب من» بگذارید.",
  SAME_PASSWORD: "رمز تازه باید با رمز فعلی فرق داشته باشد.",
  EXPIRY_PAST: "تاریخ پایان دسترسی باید در آینده باشد. برای قطع فوری، حساب را غیرفعال کنید.",
  UNKNOWN_ROLE: "چنین نقشی وجود ندارد.",
  ROLE_EXISTS: "نقشی با این کلید وجود دارد.",
  ROLE_IN_USE: "هنوز کاربرانی این نقش را دارند.",
  BACKUP_RUNNING: "پشتیبان دیگری در حال ساخت است.",
  NOT_A_BACKUP: "فایل پشتیبان OPEX نیست، کلید اشتباه است یا فایل خراب شده.",
  SEO_RUNNING: "یک بررسی سئو در حال اجراست.",
  PRIVATE_ADDRESS: "این نشانی به شبکهٔ داخلی اشاره می‌کند و مجاز نیست.",
};

/** A problem+json error, with field issues when the API sent them. */
export function ErrorNote({ error }: { error: ApiError | null }) {
  if (!error) return null;
  const issues = (error.body.issues as { path: string; message: string }[] | undefined) ?? [];
  return (
    <div className="note bad" role="alert">
      <div>{MESSAGES[error.code] ?? error.message}</div>
      {MESSAGES[error.code] && error.message && <div className="small">{error.message}</div>}
      {issues.length > 0 && (
        <ul className="small" style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
          {issues.slice(0, 12).map((i) => (
            <li key={i.path + i.message}>
              <code>{i.path}</code> — {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" role="status" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ blockSize: 22, inlineSize: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** Pretty JSON inside the RTL page. */
export const Json = ({ value }: { value: unknown }) => <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
