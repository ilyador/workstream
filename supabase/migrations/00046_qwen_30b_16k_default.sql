update public.flow_steps
set runtime_variant = 'qwen3-coder:30b-16k'
where runtime_id = 'qwen_code'
  and runtime_variant in ('qwen3-coder-plus', 'qwen3-coder:30b', 'qwen3-coder');
