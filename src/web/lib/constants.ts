import { CODING_RUNTIME_OPTIONS } from '../../shared/ai-runtimes.js';

export const BUILT_IN_TYPES = ['feature', 'bug-fix', 'ui-fix', 'refactor', 'test', 'design', 'chore', 'doc-search'];

export const ALL_TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'];

export const ALL_CONTEXT_SOURCES = [
  'agents', 'task_description', 'task_images',
  'skills', 'architecture_md', 'review_criteria', 'followup_notes', 'git_diff', 'gate_feedback', 'previous_step', 'all_previous_steps', 'previous_artifacts',
];

export const CODING_RUNTIME_IDS = CODING_RUNTIME_OPTIONS.map(runtime => runtime.id);

export const ON_MAX_RETRIES_OPTIONS = ['pause', 'fail', 'skip'];
