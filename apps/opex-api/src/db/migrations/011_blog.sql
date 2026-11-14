-- Blog (docs/opex/BLOG-PLAN.md): posts with immutable revisions, per-locale slugs (old ones redirect),
-- categories, tags and authors.

CREATE TABLE blog_authors (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  slug text NOT NULL,
  name jsonb NOT NULL DEFAULT '{}'::jsonb,        -- { fa, en, tr }
  role jsonb NOT NULL DEFAULT '{}'::jsonb,        -- job title, localized
  bio jsonb NOT NULL DEFAULT '{}'::jsonb,
  expertise jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["Multi-layer tubes", …] (Person.knowsAbout)
  photo jsonb,                                    -- { src, width, height }
  same_as jsonb NOT NULL DEFAULT '[]'::jsonb,     -- profile URLs (LinkedIn, ORCID, …)
  principal_id text,                              -- the operator who writes as this author (optional)
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE blog_categories (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  slug jsonb NOT NULL DEFAULT '{}'::jsonb,        -- per locale
  description jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE blog_tags (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE blog_posts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'scheduled', 'published', 'archived')),
  draft_revision_id text,
  published_revision_id text,
  scheduled_at timestamptz,
  first_published_at timestamptz,                 -- datePublished; stays when a post is updated
  published_at timestamptz,                       -- dateModified of the live version
  created_by text NOT NULL,                       -- principal id (no FK: content backups restore without users)
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX blog_posts_live ON blog_posts (tenant_id, published_at DESC) WHERE published_revision_id IS NOT NULL;
CREATE INDEX blog_posts_due ON blog_posts (scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE TABLE blog_revisions (
  id text PRIMARY KEY,
  post_id text NOT NULL REFERENCES blog_posts(id),
  number integer NOT NULL,
  data jsonb NOT NULL,
  data_hash text NOT NULL,
  author_principal_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (post_id, number)
);
CREATE TRIGGER blog_revisions_immutable BEFORE UPDATE OR DELETE ON blog_revisions FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Every slug a translation has had. The current one is live; old ones answer with a 301 to it.
CREATE TABLE blog_slugs (
  tenant_id text NOT NULL,
  locale text NOT NULL,
  slug text NOT NULL,
  post_id text NOT NULL REFERENCES blog_posts(id),
  current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, locale, slug)
);
CREATE INDEX blog_slugs_post ON blog_slugs (post_id, locale) WHERE current;
