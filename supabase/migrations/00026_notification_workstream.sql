-- Add workstream_id to notifications for review requests
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workstream_id uuid REFERENCES workstreams(id) ON DELETE CASCADE;

-- Expand notification type constraint to include new types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('status_change', 'mention', 'assignment', 'human_task', 'review_request'));
