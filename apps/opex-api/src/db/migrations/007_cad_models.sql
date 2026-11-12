-- T2: factory CAD (STEP/STP or GLB) converted to web models for tube closures.
-- A model is reviewed (mounting set by an operator) before it can be approved into the catalogue.

CREATE TABLE cad_models (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  closure_id text NOT NULL,                    -- catalogue closure id (product.tube.catalogue)
  source_name text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('step', 'glb')),
  source_sha256 text NOT NULL,
  asset_id text NOT NULL REFERENCES assets(id),
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'approved', 'archived')),
  bbox jsonb NOT NULL,                         -- {min, max, size} in mm
  triangles integer NOT NULL,
  parts integer NOT NULL,
  simplified boolean NOT NULL DEFAULT false,
  -- {axis: "+Y"|"-Y"|"+X"|"-X"|"+Z"|"-Z", anchorMm: [x, y, z], neckDiameterMm, thread}
  mounting jsonb,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX cad_models_closure ON cad_models (tenant_id, closure_id, created_at DESC);
