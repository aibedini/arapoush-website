import { z } from "zod";

/**
 * Runtime configuration, from the environment only (secrets never live in the repo or image).
 * Validated at start-up: a missing or malformed value stops the process with a clear message.
 */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Public origin of the API (issuer for tokens), no trailing slash. */
  PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  /** postgres://… in production. Unset: an embedded PGlite database under DATA_DIR (dev/test). */
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default("./data"),
  TENANT: z.string().default("arapoush"),
  /** Comma-separated CIDRs of reverse proxies whose X-Forwarded-For / client-cert headers are trusted. */
  TRUSTED_PROXIES: z.string().default("127.0.0.1/32,::1/128"),
  /** 32+ byte secret for session cookies and CSRF tokens. */
  SESSION_SECRET: z.string().min(32).default("dev-only-session-secret-change-me-0123456789"),
  /** Shared secret the website uses to read published content (Delivery API). */
  DELIVERY_TOKEN: z.string().min(24).default("dev-only-delivery-token-change-me"),
  /** Website revalidation webhook (content.published). */
  SITE_WEBHOOK_URL: z.string().url().optional(),
  SITE_WEBHOOK_SECRET: z.string().min(24).default("dev-only-webhook-secret-change-me-0123"),
  /** 32-byte key (base64) for AES-256-GCM encryption of inquiries (PII). Rotate with INQUIRY_KEYS_OLD. */
  INQUIRY_KEY: z.string().default(Buffer.alloc(32, "dev-only-inquiry-key").toString("base64")),
  /** Previous keys (comma-separated base64), still accepted for decryption after a rotation. */
  INQUIRY_KEYS_OLD: z.string().default(""),
  /** Where new inquiries are emailed, and the SMTP server (smtp[s]://user:pass@host:port). Unset: kept queued. */
  INQUIRY_TO: z.string().email().default("sales@arapoush.com"),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("OPEX <no-reply@arapoush.com>"),
  /** Helpdesk mailbox (P11): replies to customers come from here, and their answers arrive here. */
  SUPPORT_ADDRESS: z.string().email().default("support@arapoush.com"),
  SUPPORT_NAME: z.string().default("Arapoush"),
  /** imaps://user:pass@host:993/INBOX — customer replies are read from this mailbox. Unset: inbound email off. */
  IMAP_URL: z.string().optional(),
  /** Console origin, for links in operator notification emails. */
  CONSOLE_URL: z.string().url().default("http://localhost:3300"),
  /** Optional Cloudflare Turnstile secret: when set, forms must carry a valid token. */
  TURNSTILE_SECRET: z.string().optional(),
  /** Public origin of the website, for draft preview links. */
  SITE_URL: z.string().url().default("http://localhost:3210"),
  /** Where uploaded media is stored (filesystem driver). */
  MEDIA_DIR: z.string().default("./data/media"),
  /** Optional ClamAV daemon for upload scanning (host:port). Unset in dev: scanning is skipped and flagged. */
  CLAMAV: z.string().optional(),
  /** Operators allowed to sign in to the console only from these CIDRs (empty = anywhere). */
  CONSOLE_ALLOWED_CIDRS: z.string().default(""),
  /** Write-once audit archive directory (mount WORM storage here). Unset: no archive job. */
  AUDIT_ARCHIVE_DIR: z.string().optional(),
  /** Bearer token of the 3D renderer service (P10). Unset: render jobs queue but nothing claims them. */
  RENDER_TOKEN: z.string().min(24).optional(),
  /** Bearer token for GET /metrics (Prometheus). Unset: metrics are off. */
  METRICS_TOKEN: z.string().min(24).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof Env> & { trustedProxies: string[]; consoleCidrs: string[]; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid OPEX configuration:\n${msg}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === "production";
  if (isProd) {
    if (Buffer.from(c.INQUIRY_KEY, "base64").toString().startsWith("dev-only")) throw new Error("INQUIRY_KEY must be set in production");
    for (const [k, v] of Object.entries({ SESSION_SECRET: c.SESSION_SECRET, DELIVERY_TOKEN: c.DELIVERY_TOKEN, SITE_WEBHOOK_SECRET: c.SITE_WEBHOOK_SECRET }))
      if (v.startsWith("dev-only")) throw new Error(`${k} must be set in production`);
    if (!c.DATABASE_URL) throw new Error("DATABASE_URL must be set in production");
  }
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  return { ...c, trustedProxies: list(c.TRUSTED_PROXIES), consoleCidrs: list(c.CONSOLE_ALLOWED_CIDRS), isProd };
}
