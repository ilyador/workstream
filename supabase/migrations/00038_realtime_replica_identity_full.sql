-- Enable full row payloads on DELETE for every table the realtime channel
-- subscribes to. Default REPLICA IDENTITY only emits the PK on DELETE, but
-- our broadcast handlers need FK columns (project_id, task_id, flow_id, etc.)
-- from the `old` record to scope the event to the right listeners.
-- Without FULL, task_deleted/job_deleted/flow_deleted and friends silently
-- no-op in production, so the UI misses delete events until a page refresh.
--
-- notifications was already set by 00037. Skip it here.
alter table public.tasks replica identity full;
alter table public.jobs replica identity full;
alter table public.workstreams replica identity full;
alter table public.flows replica identity full;
alter table public.flow_steps replica identity full;
alter table public.custom_task_types replica identity full;
alter table public.project_members replica identity full;
alter table public.project_invites replica identity full;
alter table public.comments replica identity full;
alter table public.task_artifacts replica identity full;
alter table public.rag_documents replica identity full;
