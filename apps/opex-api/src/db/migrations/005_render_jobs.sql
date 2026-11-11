-- P10: 3D render jobs (effervescent sizes, caps, posters), done by the renderer service.
CREATE TABLE render_jobs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  type_key text NOT NULL,
  revision_id text NOT NULL,
  input jsonb NOT NULL,                        -- what to render: sizes, cap variants, scale, hero size
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'superseded')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  error text,
  result jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX render_jobs_queue ON render_jobs (tenant_id, status, created_at);
