"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError, setCsrf } from "@/lib/api";
import { ErrorNote } from "@/components/ui";

type Step = { at: "password" } | { at: "enroll"; challenge: string; secret?: string; uri?: string } | { at: "totp"; challenge: string };

function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [step, setStep] = useState<Step>({ at: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    go(async () => {
      const r = await api<{ mfa: "totp" | "enroll"; challenge: string }>("/v1/manage/auth/login", { body: { email, password }, retried: true, anonymous: true });
      setPassword("");
      if (r.mfa === "totp") return setStep({ at: "totp", challenge: r.challenge });
      const t = await api<{ secret: string; uri: string }>("/v1/manage/auth/mfa/enroll", { body: { challenge: r.challenge }, retried: true, anonymous: true });
      setStep({ at: "enroll", challenge: r.challenge, ...t });
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.at === "password") return;
    go(async () => {
      const r = await api<{ csrf: string }>("/v1/manage/auth/mfa", { body: { challenge: step.challenge, code }, retried: true, anonymous: true });
      setCsrf(r.csrf);
      // Only same-site paths: never redirect to another origin.
      router.replace(sameOriginPath(next));
    });
  };

  return (
    <main className="auth">
      <div className="card">
        <div className="card-head">
          <div>
            <h1 style={{ fontFamily: "var(--font-latin)", letterSpacing: "0.08em", color: "var(--accent)" }}>OPEX</h1>
            <p className="small muted">کنسول اپراتور آراپوش</p>
          </div>
        </div>
        {step.at === "password" ? (
          <form className="card-body" onSubmit={submitPassword}>
            <label className="f">
              <span>ایمیل</span>
              <input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="f">
              <span>رمز عبور</span>
              <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <ErrorNote error={error} />
            <button className="btn primary" disabled={busy}>
              ادامه
            </button>
            <p className="small muted">همهٔ ورودها، با نشانی IP و مرورگر، در گزارش رویدادها ثبت می‌شوند.</p>
          </form>
        ) : (
          <form className="card-body" onSubmit={submitCode}>
            {step.at === "enroll" ? (
              <>
                <h2>فعال‌سازی احراز هویت دومرحله‌ای</h2>
                <p className="muted small">این کلید را در برنامهٔ احراز هویت (Google Authenticator، Microsoft Authenticator، 1Password و …) اضافه کنید. فقط همین یک بار نمایش داده می‌شود.</p>
                <div className="secret" aria-label="کلید احراز هویت">
                  {step.secret?.match(/.{1,4}/g)?.join(" ")}
                </div>
                {step.uri && (
                  <a className="btn sm" href={step.uri}>
                    باز کردن در برنامهٔ احراز هویت
                  </a>
                )}
              </>
            ) : (
              <p className="muted">کد شش‌رقمی برنامهٔ احراز هویت را وارد کنید.</p>
            )}
            <label className="f">
              <span>کد شش‌رقمی</span>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
            <ErrorNote error={error} />
            <button className="btn primary" disabled={busy || code.length !== 6}>
              ورود
            </button>
            <button type="button" className="btn ghost sm" onClick={() => (setStep({ at: "password" }), setCode(""), setError(null))}>
              شروع دوباره
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

/** `next` resolved against this origin; anything that leaves it (`//x`, `/\x`, schemes) goes home (S2). */
function sameOriginPath(next: string | null | undefined): string {
  if (!next) return "/";
  try {
    const u = new URL(next, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
