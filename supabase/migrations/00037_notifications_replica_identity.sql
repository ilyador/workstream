-- Enable full row payloads on DELETE so realtime broadcasts include
-- task_id / workstream_id (needed by broadcastNotificationChange to
-- resolve project_id). Default REPLICA IDENTITY emits only the PK on DELETE.
alter table public.notifications replica identity full;
