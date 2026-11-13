import { connect } from "node:tls";
import type { Q } from "../db/index.ts";
import type { Config } from "../config.ts";
import { SECTIONS, type Section, type SiteSettings } from "./contract.ts";

/** Every section with defaults filled in (a section never saved still parses to its defaults). */
export async function loadSettings(q: Q, tenant: string): Promise<{ settings: SiteSettings; updated: Record<string, { at: string; by: string | null }> }> {
  const rows = await q<{ section: string; data: unknown; updated_by: string | null; updated_at: Date }>(`SELECT section, data, updated_by, updated_at FROM site_settings WHERE tenant_id = $1`, [tenant]);
  const out: Record<string, unknown> = {};
  const updated: Record<string, { at: string; by: string | null }> = {};
  for (const key of Object.keys(SECTIONS) as Section[]) {
    const row = rows.find((r) => r.section === key);
    const parsed = SECTIONS[key].safeParse(row?.data ?? {});
    out[key] = parsed.success ? parsed.data : SECTIONS[key].parse({});
    if (row) updated[key] = { at: new Date(row.updated_at).toISOString(), by: row.updated_by };
  }
  return { settings: out as SiteSettings, updated };
}

/** What the website needs (no secrets): analytics ids, verification tokens, indexing, security.txt. */
export function publicSettings(s: SiteSettings) {
  return { analytics: s.analytics, indexing: s.seo.indexing, security: s.security };
}

/** Certificate of the public site (SSL status in Settings). Never throws. */
export async function sslStatus(siteUrl: string): Promise<{ https: boolean; validTo: string | null; issuer: string | null; daysLeft: number | null; error: string | null }> {
  const u = new URL(siteUrl);
  if (u.protocol !== "https:") return { https: false, validTo: null, issuer: null, daysLeft: null, error: "SITE_URL is not https" };
  return new Promise((resolve) => {
    const done = (r: Awaited<ReturnType<typeof sslStatus>>) => {
      sock.destroy();
      resolve(r);
    };
    const sock = connect({ host: u.hostname, port: Number(u.port || 443), servername: u.hostname, timeout: 4000 }, () => {
      const c = sock.getPeerCertificate();
      const to = c?.valid_to ? new Date(c.valid_to) : null;
      const issuer = c?.issuer ? String(c.issuer.O ?? c.issuer.CN ?? "") : null;
      done({ https: true, validTo: to?.toISOString() ?? null, issuer, daysLeft: to ? Math.floor((to.getTime() - Date.now()) / 86_400_000) : null, error: sock.authorized ? null : String(sock.authorizationError ?? "not trusted") });
    });
    sock.on("timeout", () => done({ https: true, validTo: null, issuer: null, daysLeft: null, error: "timeout" }));
    sock.on("error", (e) => done({ https: true, validTo: null, issuer: null, daysLeft: null, error: e.message.slice(0, 200) }));
  });
}

const HEADERS = ["strict-transport-security", "content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy", "x-frame-options", "cross-origin-opener-policy"];

/** Security headers the live home page sends. Never throws. */
export async function headerStatus(url: string) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000) });
    return HEADERS.map((name) => ({ name, present: res.headers.has(name), value: res.headers.get(name)?.slice(0, 300) ?? null }));
  } catch {
    return HEADERS.map((name) => ({ name, present: false, value: null }));
  }
}

export const crawlBase = (config: Config) => (config.SEO_CRAWL_URL ?? config.SITE_URL).replace(/\/$/, "");
