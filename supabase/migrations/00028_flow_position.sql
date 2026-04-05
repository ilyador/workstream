ALTER TABLE flows ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) - 1 AS pos
  FROM flows
)
UPDATE flows SET position = ranked.pos FROM ranked WHERE flows.id = ranked.id;
