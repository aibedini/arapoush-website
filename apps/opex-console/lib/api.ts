"use client";

/** RFC 9457 problem from OPEX. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let csrf: string | null = null;
export const setCsrf = (t: string | null) => void (csrf = t);

type StepUpAsk = () => Promise<boolean>;
let askStepUp: StepUpAsk = async () => false;
/** The shell registers the step-up dialog; any request refused with STEP_UP_REQUIRED opens it once. */
export const onStepUp = (fn: StepUpAsk) => void (askStepUp = fn);

async function ensureCsrf() {
  if (csrf) return csrf;
  const r = await fetch("/v1/manage/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) throw await toError(r);
  csrf = ((await r.json()) as { csrf: string }).csrf;
  return csrf;
}

async function toError(r: Response) {
  let body: Record<string, unknown> = {};
  try {
    body = await r.json();
  } catch {}
  if (r.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.assign(`/login?next=${encodeURIComponent(location.pathname)}`);
  return new ApiError(r.status, String(body.code ?? r.status), String(body.detail ?? body.title ?? r.statusText), body);
}

/** `anonymous`: sign-in calls made before a session exists (no CSRF token yet). */
type Opts = { method?: string; body?: unknown; form?: FormData; raw?: boolean; retried?: boolean; anonymous?: boolean };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET" && !opts.anonymous) headers["x-csrf-token"] = await ensureCsrf();
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(path, { method, headers, credentials: "same-origin", cache: "no-store", body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  if (!r.ok) {
    const e = await toError(r);
    if (!opts.retried && e.code === "CSRF") {
      csrf = null;
      return api(path, { ...opts, retried: true });
    }
    if (!opts.retried && e.code === "STEP_UP_REQUIRED" && (await askStepUp())) return api(path, { ...opts, retried: true });
    throw e;
  }
  if (opts.raw) return r as unknown as T;
  return (r.status === 204 ? null : await r.json()) as T;
}

/** Thumbnail URL for an image path: unpublished OPEX media go through the operator preview. */
export const previewSrc = (src: string) => {
  const m = /^\/media\/(ast_[0-9A-Z]{26}\.\w+)$/.exec(src);
  return m ? `/v1/manage/media/${m[1]}/raw` : src;
};
