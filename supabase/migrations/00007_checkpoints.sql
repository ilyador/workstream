ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkpoint_ref text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkpoint_status text DEFAULT NULL;
