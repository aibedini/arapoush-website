-- T2.1: factory models per tube diameter, and the mounting read off the geometry.
-- A model with a shape and diameter is used only there (closure.models3d[shape][diameter]);
-- without them it is the closure's default (closure.model3d), as before.

ALTER TABLE cad_models ADD COLUMN shape_id text;          -- catalogue shape id, or NULL for every shape
ALTER TABLE cad_models ADD COLUMN diameter integer;       -- tube diameter in mm, or NULL for every diameter
ALTER TABLE cad_models ADD COLUMN suggested jsonb;        -- {axis, anchorMm, neckDiameterMm, confidence, score}
