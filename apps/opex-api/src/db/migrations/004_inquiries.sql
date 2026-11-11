-- P8: website inquiries (quote and contact forms). The payload is encrypted (AES-256-GCM).
ALTER TABLE inquiries ADD COLUMN key_id text NOT NULL DEFAULT 'v1';
ALTER TABLE inquiries ADD COLUMN summary jsonb NOT NULL DEFAULT '{}';   -- non-PII: form, locale, page, spec
CREATE INDEX inquiries_created ON inquiries (tenant_id, created_at DESC);

-- Emails to send (one per inquiry); the body is built at send time from the encrypted inquiry.
CREATE TABLE email_outbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  inquiry_id text REFERENCES inquiries(id) ON DELETE CASCADE,
  to_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
  attempt integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX email_outbox_due ON email_outbox (status, next_attempt_at);
