-- P6: partner API, change requests, policies, partner webhooks.

-- Partner (AraCMS) webhook endpoint for cr.state_changed / content.published.
ALTER TABLE partner_clients ADD COLUMN webhook_url text;
ALTER TABLE partner_clients ADD COLUMN webhook_secret text;

-- Conflicting paths when a CR needs a rebase; operator approvals (four-eyes); last state change.
ALTER TABLE change_requests ADD COLUMN conflicts jsonb;
ALTER TABLE change_requests ADD COLUMN approvals jsonb NOT NULL DEFAULT '[]';
ALTER TABLE change_requests ADD COLUMN four_eyes boolean NOT NULL DEFAULT false;

-- Items added by an operator while reviewing (amendments) are kept apart from the author's items.
ALTER TABLE change_items ADD COLUMN added_by text;
ALTER TABLE change_items ADD COLUMN position integer NOT NULL DEFAULT 0;
CREATE INDEX change_items_cr ON change_items (cr_id);
CREATE INDEX change_items_entry ON change_items (entry_id);

CREATE INDEX grants_subject ON grants (tenant_id, subject_kind, subject_id);
CREATE UNIQUE INDEX cr_idem ON change_requests (tenant_id, author_principal_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idempotency_expiry ON idempotency_keys (expires_at);
