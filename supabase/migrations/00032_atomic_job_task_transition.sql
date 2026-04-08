-- Atomic job+task status transition.
-- Eliminates race conditions from separate job/task updates across all API routes.
-- Returns the updated job row, or NULL if the guard fails (e.g., job not in expected status).

create or replace function transition_job_and_task(
  p_job_id       uuid,
  p_expected_status text,           -- guard: only proceed if job is in this status (NULL = no guard)
  p_job_updates  jsonb,             -- fields to set on jobs row (status, completed_at, etc.)
  p_task_id      uuid default null, -- if provided, also update the task
  p_task_updates jsonb default null  -- fields to set on tasks row
)
returns jsonb
language plpgsql
as $$
declare
  v_job  public.jobs%rowtype;
begin
  select * into v_job
    from public.jobs
    where id = p_job_id
    for update;

  if not found then
    return null;
  end if;

  if p_expected_status is not null and v_job.status != p_expected_status then
    return null;
  end if;

  -- Individual field checks keep the update type-safe vs dynamic SQL
  update public.jobs set
    status            = coalesce((p_job_updates->>'status')::text, status),
    completed_at      = case when p_job_updates ? 'completed_at' then (p_job_updates->>'completed_at')::timestamptz else completed_at end,
    question          = case when p_job_updates ? 'question' then (p_job_updates->>'question')::text else question end,
    answer            = case when p_job_updates ? 'answer' then (p_job_updates->>'answer')::text else answer end,
    current_phase     = case when p_job_updates ? 'current_phase' then (p_job_updates->>'current_phase')::text else current_phase end,
    log_offset        = case when p_job_updates ? 'log_offset' then (p_job_updates->>'log_offset')::bigint else log_offset end,
    flow_snapshot     = case when p_job_updates ? 'flow_snapshot' then (p_job_updates->'flow_snapshot') else flow_snapshot end,
    checkpoint_status = case when p_job_updates ? 'checkpoint_status' then (p_job_updates->>'checkpoint_status')::text else checkpoint_status end
  where id = p_job_id;

  if p_task_id is not null and p_task_updates is not null then
    update public.tasks set
      status       = coalesce((p_task_updates->>'status')::text, status),
      completed_at = case when p_task_updates ? 'completed_at' then (p_task_updates->>'completed_at')::timestamptz else completed_at end
    where id = p_task_id;
  end if;

  return p_job_updates || jsonb_build_object('id', v_job.id, 'task_id', v_job.task_id);
end;
$$;
