-- 3D studio S2: the factory models become a parts library for every product line.
-- A part is a body, a closure or an insert of a line (tube, effervescent, jars…), with a name and a
-- category. Tube closures keep closure_id (product.tube.catalogue); other parts are approved into
-- product.parts. Existing rows are tube closures. Rolling back: the columns are only added, so the
-- previous release ignores them (it lists every row as a tube closure).

ALTER TABLE cad_models ALTER COLUMN closure_id DROP NOT NULL;
ALTER TABLE cad_models ADD COLUMN line text NOT NULL DEFAULT 'tube';
ALTER TABLE cad_models ADD COLUMN kind text NOT NULL DEFAULT 'closure' CHECK (kind IN ('body', 'closure', 'insert'));
ALTER TABLE cad_models ADD COLUMN name jsonb;             -- {fa, en, tr}
ALTER TABLE cad_models ADD COLUMN category text;
CREATE INDEX cad_models_line ON cad_models (tenant_id, line, kind, created_at DESC);
