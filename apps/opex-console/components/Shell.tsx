"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, onStepUp, setCsrf } from "@/lib/api";
import { atLeast, MeContext, type Me } from "@/lib/hooks";
import { ROLE } from "@/lib/fa";
import { Dialog, ErrorNote, Loading } from "./ui";

const NAV: { href: string; label: string; min?: Me["role"] }[] = [
  { href: "/", label: "داشبورد" },
  { href: "/content", label: "محتوا" },
  { href: "/requests", label: "درخواست‌های تغییر" },
  { href: "/media", label: "رسانه" },
  { href: "/audit", label: "گزارش رویدادها", min: "auditor" },
  { href: "/operators", label: "اپراتورها", min: "operator" },
  { href: "/partners", label: "شرکا (آراسی‌ام‌اس)", min: "operator" },
  { href: "/access", label: "دسترسی‌ها", min: "operator" },
  { href: "/policies", label: "سیاست‌های تأیید" },
  { href: "/webhooks", label: "وب‌هوک‌ها", min: "operator" },
  { href: "/account", label: "حساب من" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<Me>("/v1/manage/auth/me").then(setMe).catch(() => {});
  }, []);
  useEffect(() => setMenu(false), [path]);

  // Pending reviews: a count in the menu and the tab title, refreshed every minute and on navigation.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!me) return;
    let live = true;
    const load = () => api<unknown[]>("/v1/manage/change-requests?state=pending_review").then((r) => live && setPending(r.length)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    // The review page announces decisions, so the count is right at once.
    window.addEventListener("opex:requests-changed", load);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener("opex:requests-changed", load);
    };
  }, [me, path]);
  useEffect(() => {
    const base = document.title.replace(/^(d+) /, "");
    document.title = pending ? `(${pending}) ${base}` : base;
  }, [pending, path]);

  const logout = async () => {
    try {
      await api("/v1/manage/auth/logout", { method: "POST" });
    } finally {
      setCsrf(null);
      router.replace("/login");
    }
  };

  if (!me)
    return (
      <div className="main" style={{ maxInlineSize: 480 }}>
        <Loading />
      </div>
    );

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <MeContext.Provider value={me}>
      <div className="topbar">
        <span className="brand" style={{ padding: 0 }}>
          <b>OPEX</b>
        </span>
        <button type="button" className="btn sm" aria-expanded={menu} aria-controls="side" onClick={() => setMenu((m) => !m)}>
          منو
        </button>
      </div>
      <div className="shell">
        <aside className="side" id="side" data-open={menu}>
          <div className="brand">
            <b>OPEX</b>
            <span>کنسول اپراتور</span>
          </div>
          <nav className="nav" aria-label="بخش‌ها">
            {NAV.filter((n) => !n.min || atLeast(me, n.min)).map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
                {n.label}
                {n.href === "/requests" && pending > 0 && (
                  <span className="badge warn" style={{ marginInlineStart: "auto" }} aria-label={`${pending} در انتظار بررسی`}>
                    {new Intl.NumberFormat("fa-IR").format(pending)}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="me">
            <div>
              <div style={{ fontWeight: 600 }}>{me.display}</div>
              <div className="small muted">{ROLE[me.role]}</div>
            </div>
            <div className="row">
              <button type="button" className="btn sm" onClick={logout}>
                خروج
              </button>
              {menu && (
                <button type="button" className="btn sm ghost" onClick={() => setMenu(false)}>
                  بستن منو
                </button>
              )}
            </div>
          </div>
        </aside>
        <main className="main" id="main">
          {children}
        </main>
      </div>
      <StepUp />
    </MeContext.Provider>
  );
}

/** Opened by the API client whenever a request needs a fresh second factor; retries on success. */
function StepUp() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setCode("");
        setError(null);
        setOpen(true);
      }),
    [],
  );
  useEffect(() => onStepUp(ask), [ask]);

  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/v1/manage/auth/step-up", { body: { code }, retried: true });
      finish(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => finish(false)} title="تأیید دوبارهٔ هویت">
      <form className="stack" onSubmit={submit}>
        <p className="muted">این کار حساس است. کد شش‌رقمی برنامهٔ احراز هویت را وارد کنید. تأیید تا ۵ دقیقه معتبر می‌ماند.</p>
        <label className="f">
          <span>کد احراز هویت</span>
          <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
        <ErrorNote error={error} />
        <div className="row">
          <button className="btn primary" disabled={busy || code.length !== 6}>
            تأیید و ادامه
          </button>
          <button type="button" className="btn" onClick={() => finish(false)}>
            انصراف
          </button>
        </div>
      </form>
    </Dialog>
  );
}
