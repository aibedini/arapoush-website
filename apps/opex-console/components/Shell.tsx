"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, onStepUp, setCsrf } from "@/lib/api";
import { atLeast, canWrite, MeContext, type Me } from "@/lib/hooks";
import { ROLE } from "@/lib/fa";
import { Dialog, ErrorNote, Loading } from "./ui";
import {
  Bell,
  BookOpenText,
  PaintBrush,
  ClockCounterClockwise,
  GitPullRequest,
  Handshake,
  IdentificationCard,
  Images,
  Key,
  ListChecks,
  PlugsConnected,
  ShieldCheck,
  SquaresFour,
  TextAa,
  Tray,
  UserCircle,
  UsersThree,
  Package,
  type Icon,
} from "@phosphor-icons/react";

type Item = {
  href: string;
  label: string;
  icon: Icon;
  min?: Me["role"];
  write?: boolean;
  external?: boolean;
};
/** Grouped by what operators do: daily work, the website, then settings. */
const NAV: { group: string; items: Item[] }[] = [
  {
    group: "کار روزانه",
    items: [
      { href: "/", label: "داشبورد", icon: SquaresFour },
      { href: "/tickets", label: "صندوق تیکت‌ها", icon: Tray, write: true },
      { href: "/requests", label: "درخواست‌های تغییر", icon: GitPullRequest },
    ],
  },
  {
    group: "وب‌سایت",
    items: [
      { href: "/visual", label: "ویرایشگر بصری", icon: PaintBrush },
      { href: "/content", label: "محتوا (فیلدها)", icon: TextAa },
      { href: "/catalogue", label: "کاتالوگ تیوب", icon: Package, write: true },
      { href: "/forms", label: "فرم‌ها", icon: ListChecks },
      { href: "/media", label: "رسانه", icon: Images },
    ],
  },
  {
    group: "تنظیمات",
    items: [
      {
        href: "/helpdesk",
        label: "تیم‌ها و پاسخ‌های آماده",
        icon: UsersThree,
        min: "operator",
      },
      {
        href: "/operators",
        label: "اپراتورها",
        icon: IdentificationCard,
        min: "operator",
      },
      {
        href: "/partners",
        label: "شرکا (آراسی‌ام‌اس)",
        icon: Handshake,
        min: "operator",
      },
      { href: "/access", label: "دسترسی‌ها", icon: Key, min: "operator" },
      { href: "/policies", label: "سیاست‌های تأیید", icon: ShieldCheck },
      {
        href: "/webhooks",
        label: "وب‌هوک‌ها",
        icon: PlugsConnected,
        min: "operator",
      },
      {
        href: "/audit",
        label: "گزارش رویدادها",
        icon: ClockCounterClockwise,
        min: "auditor",
      },
      {
        href: "/v1/manage/docs",
        label: "مستندات API",
        icon: BookOpenText,
        external: true,
      },
      { href: "/account", label: "حساب من", icon: UserCircle },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<Me>("/v1/manage/auth/me")
      .then(setMe)
      .catch(() => {});
  }, []);
  useEffect(() => setMenu(false), [path]);

  // Pending reviews: a count in the menu and the tab title, refreshed every minute and on navigation.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!me) return;
    let live = true;
    const load = () =>
      api<unknown[]>("/v1/manage/change-requests?state=pending_review")
        .then((r) => live && setPending(r.length))
        .catch(() => {});
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
  // Helpdesk: unread tickets for me (mine + unassigned).
  const [tickets, setTickets] = useState(0);
  useEffect(() => {
    if (!me || !canWrite(me)) return;
    let live = true;
    const load = () =>
      api<{ unread: number }>("/v1/manage/tickets/counts")
        .then((c) => live && setTickets(c.unread))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener("opex:tickets-changed", load);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener("opex:tickets-changed", load);
    };
  }, [me, path]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title =
      pending + tickets ? `(${pending + tickets}) ${base}` : base;
  }, [pending, tickets, path]);

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

  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  return (
    <MeContext.Provider value={me}>
      <div className="topbar">
        <span className="brand" style={{ padding: 0 }}>
          <b>OPEX</b>
        </span>
        <button
          type="button"
          className="btn sm"
          aria-expanded={menu}
          aria-controls="side"
          onClick={() => setMenu((m) => !m)}
        >
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
            {NAV.map((g) => {
              const items = g.items.filter(
                (n) =>
                  (!n.min || atLeast(me, n.min)) && (!n.write || canWrite(me)),
              );
              if (!items.length) return null;
              return (
                <div key={g.group} className="nav-group">
                  <div className="nav-h">{g.group}</div>
                  {items.map((n) => {
                    const count =
                      n.href === "/requests"
                        ? pending
                        : n.href === "/tickets"
                          ? tickets
                          : 0;
                    return n.external ? (
                      <a
                        key={n.href}
                        href={n.href}
                        target="_blank"
                        rel="noopener"
                      >
                        <n.icon size={18} aria-hidden />
                        <span>{n.label}</span>
                        <span className="sr-only">(در زبانهٔ تازه)</span>
                      </a>
                    ) : (
                      <Link
                        key={n.href}
                        href={n.href}
                        aria-current={active(n.href) ? "page" : undefined}
                      >
                        <n.icon
                          size={18}
                          weight={active(n.href) ? "fill" : "regular"}
                          aria-hidden
                        />
                        <span>{n.label}</span>
                        {count > 0 && (
                          <span
                            className={`badge ${n.href === "/tickets" ? "accent" : "warn"} nav-count`}
                            aria-label={`${count} مورد تازه`}
                          >
                            {new Intl.NumberFormat("fa-IR").format(count)}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="me">
            <div
              className="row"
              style={{ justifyContent: "space-between", flexWrap: "nowrap" }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{me.display}</div>
                <div className="small muted">{ROLE[me.role]}</div>
              </div>
              <Notifications />
            </div>
            <div className="row">
              <button type="button" className="btn sm" onClick={logout}>
                خروج
              </button>
              {menu && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setMenu(false)}
                >
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
        <p className="muted">
          این کار حساس است. کد شش‌رقمی برنامهٔ احراز هویت را وارد کنید. تأیید تا
          ۵ دقیقه معتبر می‌ماند.
        </p>
        <label className="f">
          <span>کد احراز هویت</span>
          <input
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
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

type Note = {
  id: string;
  kind: string;
  text: string;
  read_at: string | null;
  created_at: string;
  number: number | null;
};
/** The bell: assignments, referrals, mentions, customer replies and SLA alerts. */
function Notifications() {
  const [data, setData] = useState<{ unread: number; items: Note[] } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const load = useCallback(
    () =>
      api<{ unread: number; items: Note[] }>("/v1/manage/notifications")
        .then(setData)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  const go = async (n: Note) => {
    setOpen(false);
    if (!n.read_at)
      await api("/v1/manage/notifications/read", {
        body: { ids: [n.id] },
      }).catch(() => {});
    load();
    if (n.number) router.push(`/tickets/${n.number}`);
  };
  const unread = data?.unread ?? 0;
  return (
    <>
      <button
        type="button"
        className="btn ghost icon-btn"
        aria-label={unread ? `اعلان‌ها، ${unread} خوانده‌نشده` : "اعلان‌ها"}
        onClick={() => setOpen(true)}
      >
        <Bell size={20} weight={unread ? "fill" : "regular"} aria-hidden />
        {unread > 0 && (
          <span className="dot-count">
            {new Intl.NumberFormat("fa-IR").format(Math.min(unread, 99))}
          </span>
        )}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="اعلان‌ها">
        {!data?.items.length ? (
          <p className="empty">اعلانی نیست.</p>
        ) : (
          <>
            <ul className="notes-list">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="note-item"
                    data-unread={!n.read_at}
                    onClick={() => go(n)}
                  >
                    <span>{n.text}</span>
                    <span className="small muted">
                      {new Intl.DateTimeFormat("fa-IR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(n.created_at))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {unread > 0 && (
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  api("/v1/manage/notifications/read", { body: {} }).then(load)
                }
              >
                همه خوانده شد
              </button>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
