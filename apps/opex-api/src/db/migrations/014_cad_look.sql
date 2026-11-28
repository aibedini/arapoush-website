-- 3D studio: a part's colour and finish chosen in the studio ({finish, hex, meshes: [{i, finish, hex}]}).
-- Only added; the previous release ignores it.
ALTER TABLE cad_models ADD COLUMN look jsonb;
