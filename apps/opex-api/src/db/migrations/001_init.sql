-- OPEX core schema (plan §2.2). Every table carries tenant_id; ids are ULIDs (text).

-- ── Identity ────────────────────────────────────────────────────────────────
CREATE TABLE principals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('operator', 'partner_user', 'service')),
  email text,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'locked', 'invited')),
  role text,                                   -- operator: super_admin|operator|auditor|viewer; partner_user: partner role key
  partner_client_id text,
  mfa_required boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE credentials (
  principal_id text NOT NULL REFERENCES principals(id),
  kind text NOT NULL CHECK (kind IN ('password', 'totp')),
  secret text NOT NULL,                        -- argon2id hash (password) or base32 secret (totp)
  confirmed boolean NOT NULL DEFAULT false,
  last_used_step bigint,                       -- TOTP replay protection
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz,
  PRIMARY KEY (principal_id, kind)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  principal_id text NOT NULL REFERENCES principals(id),
  kind text NOT NULL CHECK (kind IN ('console', 'oauth')),
  client_id text,
  ip text,
  user_agent text,
  mfa boolean NOT NULL DEFAULT false,
  step_up_at timestamptz,
  csrf_hash text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text
);
CREATE INDEX sessions_principal ON sessions (principal_id) WHERE revoked_at IS NULL;

CREATE TABLE partner_clients (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  allowed_cidrs text[] NOT NULL DEFAULT '{}',
  mtls_fingerprint text,                       -- sha256 of the client certificate (hex), checked when set
  jwks jsonb NOT NULL DEFAULT '{"keys":[]}',   -- public keys for private_key_jwt, DPoP and request signatures
  redirect_uris text[] NOT NULL DEFAULT '{}',
  scopes text[] NOT NULL DEFAULT '{}',
  contact text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL,
  principal_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL,
  ip text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE refresh_tokens (
  token_hash text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(id),
  family text NOT NULL,
  dpop_jkt text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX refresh_family ON refresh_tokens (family);

CREATE TABLE revoked_jti (
  jti text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

-- ── Content ─────────────────────────────────────────────────────────────────
CREATE TABLE content_types (
  key text PRIMARY KEY,
  version integer NOT NULL,
  schema_hash text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE entries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  type_key text NOT NULL REFERENCES content_types(key),
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  draft_revision_id text,
  published_revision_id text,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, type_key, slug)
);

CREATE TABLE revisions (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES entries(id),
  number integer NOT NULL,
  data jsonb NOT NULL,
  data_hash text NOT NULL,
  parent_revision_id text,
  author_principal_id text,
  via_cr_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (entry_id, number)
);

-- Revisions are immutable once written.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed (append-only)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON revisions FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ── Media ───────────────────────────────────────────────────────────────────
CREATE TABLE assets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  sha256 text NOT NULL,
  mime text NOT NULL,
  bytes bigint NOT NULL,
  width integer,
  height integer,
  original_name text,
  status text NOT NULL DEFAULT 'quarantine' CHECK (status IN ('quarantine', 'clean', 'rejected')),
  scan text,                                   -- 'clean' | 'skipped' | 'infected:<sig>'
  public boolean NOT NULL DEFAULT false,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, sha256)
);

-- ── Change requests, policies, grants ───────────────────────────────────────
CREATE TABLE change_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  partner_client_id text,
  author_principal_id text NOT NULL,
  title text NOT NULL,
  note text,
  state text NOT NULL CHECK (state IN ('submitted', 'pending_review', 'approved', 'published', 'rejected', 'withdrawn', 'needs_rebase', 'expired')),
  decision jsonb,                              -- policy decision {effect, policy, reasons}
  decided_by text,
  decided_at timestamptz,
  decision_reason text,
  published_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX cr_state ON change_requests (tenant_id, state);

CREATE TABLE change_items (
  id text PRIMARY KEY,
  cr_id text NOT NULL REFERENCES change_requests(id),
  entry_id text NOT NULL REFERENCES entries(id),
  base_revision_id text NOT NULL,
  path text NOT NULL,                          -- field path incl. @locale
  op text NOT NULL CHECK (op IN ('set', 'insert', 'remove')),
  old_value jsonb,
  new_value jsonb,
  decision text CHECK (decision IN ('approved', 'rejected')),
  decision_reason text
);

CREATE TABLE approval_policies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  scope jsonb NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}',
  effect text NOT NULL CHECK (effect IN ('auto_approve', 'require_review', 'deny')),
  auto_publish boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('partner_role', 'partner_user', 'partner_client')),
  subject_id text NOT NULL,
  scope jsonb NOT NULL,
  actions text[] NOT NULL,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ── Publishing and webhooks ─────────────────────────────────────────────────
CREATE TABLE publications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entry_id text NOT NULL,
  revision_id text NOT NULL,
  by_principal_id text,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'cr', 'schedule', 'rollback', 'seed')),
  webhook_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE webhook_deliveries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  target text NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
  last_code integer,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE idempotency_keys (
  key text NOT NULL,
  principal_id text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  status integer NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (principal_id, key)
);

CREATE TABLE inquiries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  form text NOT NULL,
  payload_enc text NOT NULL,                   -- AES-256-GCM, key from INQUIRY_KEY
  ip text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  handled_at timestamptz,
  handled_by text
);

-- ── Audit (plan §8): append-only, hash-chained ──────────────────────────────
CREATE TABLE audit_events (
  seq bigserial PRIMARY KEY,
  id text NOT NULL UNIQUE,
  ts timestamptz NOT NULL,
  tenant_id text NOT NULL,
  action text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  actor jsonb NOT NULL,
  request jsonb NOT NULL,
  resource jsonb,
  changes jsonb,
  reason text,
  prev_hash text NOT NULL,
  hash text NOT NULL
);
CREATE INDEX audit_ts ON audit_events (tenant_id, ts DESC);
CREATE INDEX audit_action ON audit_events (tenant_id, action);
CREATE INDEX audit_actor ON audit_events (tenant_id, (actor->>'id'));
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE FUNCTION forbid_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE on % is not allowed (append-only)', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION forbid_truncate();

-- In production the API connects as opex_app: it may only INSERT and SELECT audit rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opex_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM opex_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON revisions FROM opex_app;
  END IF;
END $$;
