/**
 * RFC 9457 problem details with stable machine codes. Every error the API returns goes through
 * here; internal errors never leak stack traces or SQL.
 */
export class Problem extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly extra?: Record<string, unknown>;
  constructor(status: number, code: string, detail?: string, extra?: Record<string, unknown>) {
    super(detail ?? code);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra;
  }
}

export const unauthorized = (detail = "Authentication required") => new Problem(401, "UNAUTHENTICATED", detail);
export const forbidden = (code = "FORBIDDEN", detail = "Not allowed", extra?: Record<string, unknown>) => new Problem(403, code, detail, extra);
export const notFound = (what = "Resource") => new Problem(404, "NOT_FOUND", `${what} not found`);
export const badRequest = (code: string, detail: string, extra?: Record<string, unknown>) => new Problem(400, code, detail, extra);
export const conflict = (code: string, detail: string, extra?: Record<string, unknown>) => new Problem(409, code, detail, extra);
