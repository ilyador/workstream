alter table public.flow_steps
  alter column runtime_variant drop not null,
  alter column runtime_variant drop default;
