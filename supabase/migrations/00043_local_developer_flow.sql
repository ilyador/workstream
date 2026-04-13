-- ============================================================
-- Migration 00043: Local Developer flow
-- Opus plans, Qwen implements, then standard verify + review.
-- ============================================================

do $$
declare
  proj record;
  fid uuid;

  plan_instr text := E'RULES:\n- You are creating a detailed implementation plan. Do NOT modify any files.\n- Explore the codebase to understand the relevant files, architecture, and patterns.\n- If requirements are ambiguous, ask -- do not guess.\n\nRead the codebase thoroughly, then produce a detailed implementation plan that includes:\n1. Every file that needs to be created or modified.\n2. For each file, the specific changes to make (functions to add/edit, imports, exports, etc.).\n3. The order in which changes should be applied.\n4. Any dependencies between changes.\n\nBe precise -- the next step will follow your plan exactly to implement the changes.';

  develop_instr text := E'RULES:\n- You are implementing a task by following the plan from the previous step.\n- Follow the plan exactly. Do NOT deviate unless you discover the plan has an error.\n- Do NOT fix unrelated issues you discover.\n- Do NOT refactor code outside the scope of this task.\n- Run tests after making changes if a test suite exists.\n\nImplement the changes described in the plan above. Follow it step by step, applying each change in the specified order.';

  verify_instr text := E'RULES:\n- Run the test suite. Do nothing else.\n- Do NOT modify any files.\n- Do NOT attempt to fix failing tests.\n- Report what passed and what failed.\n\nCRITICAL — when tests fail, you MUST determine if the failure is caused by THIS task''s changes:\n1. Run `git diff HEAD` to see what was changed in this task.\n2. Look at the failing test — is it testing code that was modified? Is the error related to the changes?\n3. Based on this analysis, pick ONE of these three responses:\n\nALL TESTS PASS or only unrelated tests fail:\nEnd with:\n```json\n{"passed": true}\n```\n\nRELATED failure (test fails because of code this task changed):\nEnd with:\n```json\n{"passed": false, "reason": "Brief description of what failed"}\n```\n\nUNRELATED or UNSURE failure:\nDo NOT include any JSON verdict block. Instead, end your response with a question like:\n"Should I treat this as a failure? The failing test [name] appears unrelated because [reason]."\nThis will pause the job so the user can decide. Do NOT include a verdict block when asking.';

  review_instr text := E'RULES:\n- Review the git diff only. Do NOT modify files.\n- Check: code quality, architecture alignment, completeness.\n- Compare against review criteria and architecture docs if provided.\n- Focus on real issues, not style nitpicks.\n\nReview the changes made for correctness and quality.\n\nIMPORTANT: You MUST end your response with a JSON verdict block:\n```json\n{"passed": true}\n```\nor if issues found:\n```json\n{"passed": false, "reason": "Brief description of issues"}\n```';

  exec_ctx text[] := '{"agents","task_description","skills","task_images","followup_notes","gate_feedback"}';
  develop_ctx text[] := '{"agents","task_description","skills","task_images","followup_notes","gate_feedback","previous_step"}';
  verify_ctx text[] := '{"task_description"}';
  review_ctx text[] := '{"task_description","architecture_md","review_criteria","git_diff"}';
begin
  for proj in select id from projects loop

    -- skip if already exists for this project
    if exists (select 1 from flows where project_id = proj.id and name = 'Local Developer') then
      continue;
    end if;

    insert into flows (project_id, name, description, is_builtin, default_types)
    values (proj.id, 'Local Developer', 'Opus plans, Qwen implements, then verify and review.', false, '{}')
    returning id into fid;

    insert into flow_steps (flow_id, name, position, instructions, runtime_kind, runtime_id, runtime_variant, tools, context_sources, use_project_data, is_gate, on_fail_jump_to, max_retries, on_max_retries) values
    (fid, 'plan',    1, plan_instr,    'coding', 'claude_code', 'opus',             '{"Read","Grep","Glob","Bash"}',                exec_ctx,    false, false, null, 0, 'pause'),
    (fid, 'develop', 2, develop_instr, 'coding', 'qwen_code',  'qwen3-coder-plus', '{"Read","Edit","Write","Bash","Grep","Glob"}',  develop_ctx, false, false, null, 0, 'pause'),
    (fid, 'verify',  3, verify_instr,  'coding', 'claude_code', 'sonnet',           '{"Bash","Read"}',                              verify_ctx,  false, true,  2,    2, 'pause'),
    (fid, 'review',  4, review_instr,  'coding', 'claude_code', 'sonnet',           '{"Read","Grep"}',                              review_ctx,  false, true,  2,    1, 'pause');

  end loop;
end $$;
