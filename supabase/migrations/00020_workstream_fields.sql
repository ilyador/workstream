ALTER TABLE workstreams ADD COLUMN IF NOT EXISTS description text default '';
ALTER TABLE workstreams ADD COLUMN IF NOT EXISTS has_code boolean default true;
