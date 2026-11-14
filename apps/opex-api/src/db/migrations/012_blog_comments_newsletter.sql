-- Blog comments (moderated, per locale, one level of replies) and the journal newsletter
-- (double opt-in). Email addresses are stored encrypted (INQUIRY_KEY) with a keyed hash for lookups.

CREATE TABLE blog_comments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  post_id text NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  locale text NOT NULL,
  parent_id text REFERENCES blog_comments(id) ON DELETE CASCADE,
  name text NOT NULL,
  email_hash text,
  email_enc text,
  key_id text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'spam', 'trash')),
  by_principal text,                              -- set when the team replies from the console
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  moderated_at timestamptz,
  moderated_by text
);
CREATE INDEX blog_comments_post ON blog_comments (post_id, status, created_at);
CREATE INDEX blog_comments_queue ON blog_comments (tenant_id, status, created_at DESC);

CREATE TABLE blog_subscribers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  email_hash text NOT NULL,
  email_enc text NOT NULL,
  key_id text NOT NULL,
  locale text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token_hash text NOT NULL,                       -- confirm / unsubscribe links (sha256 of the token)
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  UNIQUE (tenant_id, email_hash)
);

ALTER TABLE blog_posts ADD COLUMN notified_at timestamptz;   -- subscribers were emailed about it
