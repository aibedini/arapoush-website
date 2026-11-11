-- One-time identifiers (client assertion jti, DPoP proof jti, request-signature nonces): replay cache.
CREATE TABLE jti_seen (
  jti text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX jti_seen_exp ON jti_seen (expires_at);

-- Each partner client has a service principal for machine (client_credentials) calls.
ALTER TABLE partner_clients ADD COLUMN service_principal_id text;
ALTER TABLE partner_clients ADD COLUMN client_id text UNIQUE;
