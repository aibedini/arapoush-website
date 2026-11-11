-- P11: form builder, teams, tickets (helpdesk), notifications, two-way email.

ALTER TABLE principals ADD COLUMN prefs jsonb NOT NULL DEFAULT '{}';   -- e.g. {"emailNotifications": true}

CREATE TABLE teams (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  -- Minutes per priority: {"urgent": {"first": 60, "resolve": 480}, …}; missing keys use defaults.
  sla jsonb NOT NULL DEFAULT '{}',
  auto_assign boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE team_members (
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  principal_id text NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'lead')),
  available boolean NOT NULL DEFAULT true,
  PRIMARY KEY (team_id, principal_id)
);

CREATE TABLE forms (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  system boolean NOT NULL DEFAULT false,      -- quote / contact: used by built-in site components
  draft jsonb NOT NULL,
  published jsonb,
  version integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE form_versions (
  form_id text NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  published_by text,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (form_id, version)
);

CREATE TABLE ticket_counters (tenant_id text PRIMARY KEY, next integer NOT NULL DEFAULT 1001);

CREATE TABLE tickets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  number integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('form', 'email')),
  form_id text REFERENCES forms(id) ON DELETE SET NULL,
  form_version integer,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'open', 'pending', 'on_hold', 'resolved', 'closed', 'spam')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  team_id text REFERENCES teams(id) ON DELETE SET NULL,
  assignee_id text REFERENCES principals(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  -- PII (subject, requester, answers, context) is encrypted; the row id is the associated data.
  data_enc text NOT NULL,
  key_id text NOT NULL,
  requester_hash text,                         -- HMAC of the requester's email (matching, blocking)
  locale text,
  page text,
  ip text,
  first_response_due timestamptz,
  resolve_due timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  sla_breached boolean NOT NULL DEFAULT false,
  merged_into text REFERENCES tickets(id) ON DELETE SET NULL,
  retention_days integer NOT NULL DEFAULT 730,
  last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_customer_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX tickets_list ON tickets (tenant_id, status, last_activity_at DESC);
CREATE INDEX tickets_assignee ON tickets (assignee_id, status);
CREATE INDEX tickets_team ON tickets (team_id, status);
CREATE INDEX tickets_requester ON tickets (tenant_id, requester_hash);

-- The ticket timeline (append-only). Bodies are encrypted with the event id as associated data.
CREATE TABLE ticket_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  ticket_id text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_kind text NOT NULL,
  actor_id text,
  actor_display text,
  body_enc text,
  key_id text,
  meta jsonb NOT NULL DEFAULT '{}',
  message_id text,                             -- outbound / inbound email Message-ID
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ticket_events_ticket ON ticket_events (ticket_id, created_at);
CREATE INDEX ticket_events_message ON ticket_events (tenant_id, message_id);

CREATE TABLE ticket_reads (
  ticket_id text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  principal_id text NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  first_opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (ticket_id, principal_id)
);

CREATE TABLE ticket_attachments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  ticket_id text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id text REFERENCES ticket_events(id) ON DELETE CASCADE,
  field text,
  name text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL,
  data_enc text NOT NULL,
  key_id text NOT NULL,
  scan text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ticket_attachments_ticket ON ticket_attachments (ticket_id);

CREATE TABLE notifications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  principal_id text NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ticket_id text REFERENCES tickets(id) ON DELETE CASCADE,
  -- No PII: "#1042 was referred to you by Sara".
  text text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX notifications_inbox ON notifications (principal_id, read_at, created_at DESC);

CREATE TABLE saved_replies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  team_id text REFERENCES teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  body jsonb NOT NULL,                         -- localized {fa, en, tr}
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sender_blocks (tenant_id text NOT NULL, hash text NOT NULL, until timestamptz NOT NULL, PRIMARY KEY (tenant_id, hash));

CREATE TABLE mailbox_state (
  tenant_id text PRIMARY KEY,
  uid_validity text,
  last_uid bigint NOT NULL DEFAULT 0,
  last_poll_at timestamptz,
  last_error text
);

-- Outbox: any email, stored encrypted (to, subject, body, headers) and sent by the worker.
ALTER TABLE email_outbox ADD COLUMN kind text NOT NULL DEFAULT 'inquiry';
ALTER TABLE email_outbox ADD COLUMN ticket_id text REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE email_outbox ADD COLUMN message_enc text;
ALTER TABLE email_outbox ADD COLUMN key_id text;
ALTER TABLE email_outbox ALTER COLUMN to_address DROP NOT NULL;
