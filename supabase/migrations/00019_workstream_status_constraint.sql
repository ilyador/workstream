-- Add 'reviewing', 'review_failed', 'merged' to workstream status constraint
ALTER TABLE workstreams DROP CONSTRAINT IF EXISTS workstreams_status_check;
ALTER TABLE workstreams ADD CONSTRAINT workstreams_status_check
  CHECK (status IN ('active', 'paused', 'complete', 'archived', 'reviewing', 'review_failed', 'merged'));
