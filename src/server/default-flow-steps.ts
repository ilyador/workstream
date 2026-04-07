import type { FlowStepRow } from './default-flows.js';

export const VERIFY_STEP: FlowStepRow = {
  name: 'verify',
  position: 2,
  model: 'sonnet',
  tools: ['Bash', 'Read'],
  context_sources: ['task_description'],
  is_gate: true,
  on_fail_jump_to: 1,
  max_retries: 2,
  on_max_retries: 'pause',
  include_agents_md: false,
  instructions: `RULES:
- Run the test suite. Do nothing else.
- Do NOT modify any files.
- Do NOT attempt to fix failing tests.
- Report what passed and what failed.

CRITICAL — when tests fail, you MUST determine if the failure is caused by THIS task's changes:
1. Run \`git diff HEAD\` to see what was changed in this task.
2. Look at the failing test — is it testing code that was modified? Is the error related to the changes?
3. Based on this analysis, pick ONE of these three responses:

ALL TESTS PASS or only unrelated tests fail:
End with:
\`\`\`json
{"passed": true}
\`\`\`

RELATED failure (test fails because of code this task changed):
End with:
\`\`\`json
{"passed": false, "reason": "Brief description of what failed"}
\`\`\`

UNRELATED or UNSURE failure:
Do NOT include any JSON verdict block. Instead, end your response with a question like:
"Should I treat this as a failure? The failing test [name] appears unrelated because [reason]."
This will pause the job so the user can decide. Do NOT include a verdict block when asking.`,
};

export const REVIEW_STEP: FlowStepRow = {
  name: 'review',
  position: 3,
  model: 'sonnet',
  tools: ['Read', 'Grep'],
  context_sources: ['task_description', 'architecture_md', 'review_criteria', 'git_diff'],
  is_gate: true,
  on_fail_jump_to: 1,
  max_retries: 1,
  on_max_retries: 'pause',
  include_agents_md: false,
  instructions: `RULES:
- Review the git diff only. Do NOT modify files.
- Check: code quality, architecture alignment, completeness.
- Compare against review criteria and architecture docs if provided.
- Focus on real issues, not style nitpicks.

Review the changes made for correctness and quality.

IMPORTANT: You MUST end your response with a JSON verdict block:
\`\`\`json
{"passed": true}
\`\`\`
or if issues found:
\`\`\`json
{"passed": false, "reason": "Brief description of issues"}
\`\`\``,
};

export const EXECUTE_CONTEXT = ['claude_md', 'agents_md', 'task_description', 'skills', 'task_images', 'followup_notes', 'gate_feedback'];
