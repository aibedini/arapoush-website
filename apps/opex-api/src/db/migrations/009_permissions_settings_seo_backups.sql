-- S1–S4: fine-grained console permissions, site settings, the SEO engine and backups.

-- ── Permissions ─────────────────────────────────────────────────────────────
-- Per-operator additions and removals on top of the role (authz/permissions.ts).
ALTER TABLE principals ADD COLUMN perm_allow jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE principals ADD COLUMN perm_deny jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Custom roles (the four built-in roles live in code and cannot be edited).
CREATE TABLE roles (
  tenant_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, key)
);

-- ── Site settings ───────────────────────────────────────────────────────────
-- One row per section (company, analytics, security, seo). Secrets inside `data` are encrypted.
CREATE TABLE site_settings (
  tenant_id text NOT NULL,
  section text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, section)
);

-- ── SEO engine ──────────────────────────────────────────────────────────────
CREATE TABLE seo_reports (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'schedule', 'publish')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  base_url text NOT NULL,
  score integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz
);
CREATE INDEX seo_reports_recent ON seo_reports (tenant_id, created_at DESC);

-- ── Backups ─────────────────────────────────────────────────────────────────
CREATE TABLE backups (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('full', 'content', 'database', 'media')),
  trigger text NOT NULL CHECK (trigger IN ('manual', 'schedule', 'pre_restore')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  file text,
  bytes bigint,
  sha256 text,
  encrypted boolean NOT NULL DEFAULT false,
  remote jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz
);
CREATE INDEX backups_recent ON backups (tenant_id, created_at DESC);
