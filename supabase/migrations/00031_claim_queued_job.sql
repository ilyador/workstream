-- Atomically claim the next queued job for a worker.
create or replace function public.claim_next_queued_job()
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.jobs j
    join public.tasks t on t.id = j.task_id
    where j.status = 'queued'
      and (
        t.workstream_id is null
        or pg_try_advisory_xact_lock(314159, hashtext(t.workstream_id::text))
      )
      and (
        t.workstream_id is null
        or not exists (
          select 1
          from public.jobs earlier
          join public.tasks earlier_task on earlier_task.id = earlier.task_id
          where earlier.id <> j.id
            and earlier.status = 'queued'
            and earlier_task.workstream_id = t.workstream_id
            and (
              coalesce(earlier.started_at, '-infinity'::timestamptz),
              earlier.id
            ) < (
              coalesce(j.started_at, '-infinity'::timestamptz),
              j.id
            )
        )
      )
      and not exists (
        select 1
        from public.jobs active
        join public.tasks active_task on active_task.id = active.task_id
        where active.id <> j.id
          and active.status in ('running', 'paused', 'review', 'canceling')
          and active_task.workstream_id is not null
          and active_task.workstream_id = t.workstream_id
      )
    order by j.started_at asc nulls first, j.id
    limit 1
    for update of j skip locked
  )
  update public.jobs j
  set status = 'running',
      started_at = now()
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

revoke all on function public.claim_next_queued_job() from public;
revoke all on function public.claim_next_queued_job() from anon;
revoke all on function public.claim_next_queued_job() from authenticated;
grant execute on function public.claim_next_queued_job() to service_role;
