import type { DbRecord } from './authz.js';
import { EXECUTE_CONTEXT, REVIEW_STEP, VERIFY_STEP } from './default-flow-steps.js';

export type FlowStepRow = DbRecord & { name: string };

type DefaultFlow = { name: string; description: string; default_types: string[]; steps: FlowStepRow[] };

export const DEFAULT_FLOWS: DefaultFlow[] = [
  {
    name: 'Developer',
    default_types: ['feature', 'ui-fix', 'design', 'chore'],
    description: 'Plan and implement features, verify with tests, review.',
    steps: [
      { name: 'implement', position: 1, model: 'opus', tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'], context_sources: EXECUTE_CONTEXT, is_gate: false, on_fail_jump_to: null, max_retries: 0, on_max_retries: 'pause', include_agents_md: true, instructions: `RULES:
- You are implementing a task. Plan your approach first, then implement it.
- Do NOT fix unrelated issues you discover.
- Do NOT refactor code outside the scope of this task.
- If requirements are ambiguous, ask -- do not guess.
- Run tests after making changes if a test suite exists.

Read the codebase to understand the relevant files and architecture. Create a plan, then implement the described feature. Follow existing code patterns.` },
      { ...VERIFY_STEP },
      { ...REVIEW_STEP },
    ],
  },
  {
    name: 'Bug Hunter',
    default_types: ['bug-fix'],
    description: 'Analyze bugs, fix them, verify and review.',
    steps: [
      { name: 'fix', position: 1, model: 'opus', tools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob'], context_sources: EXECUTE_CONTEXT, is_gate: false, on_fail_jump_to: null, max_retries: 0, on_max_retries: 'pause', include_agents_md: true, instructions: `RULES:
- You are fixing a bug. Analyze the problem first, then fix it.
- Do NOT fix unrelated issues you discover.
- Do NOT refactor code outside the scope of this fix.
- If the root cause is unclear, ask -- do not guess.
- Run tests after making changes if a test suite exists.

Analyze the codebase to understand the bug. Identify the root cause and location. Then fix the issue with the minimal changes needed.` },
      { ...VERIFY_STEP },
      { ...REVIEW_STEP },
    ],
  },
  {
    name: 'Refactorer',
    default_types: ['refactor'],
    description: 'Plan and execute refactors, verify nothing broke, review.',
    steps: [
      { name: 'refactor', position: 1, model: 'opus', tools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob'], context_sources: EXECUTE_CONTEXT, is_gate: false, on_fail_jump_to: null, max_retries: 0, on_max_retries: 'pause', include_agents_md: true, instructions: `RULES:
- You are refactoring code. Plan the refactor first, then execute it.
- Maintain all existing behavior. Do NOT change functionality.
- Do NOT fix unrelated issues or add features.
- Run tests after every significant change to catch regressions early.

Read the codebase to understand the current structure. Plan the refactor, then execute it. Maintain all existing behavior.` },
      { ...VERIFY_STEP },
      { ...REVIEW_STEP },
    ],
  },
  {
    name: 'Tester',
    default_types: ['test'],
    description: 'Plan and write tests, verify they pass, review.',
    steps: [
      { name: 'write-tests', position: 1, model: 'opus', tools: ['Read', 'Write', 'Bash', 'Grep', 'Glob'], context_sources: EXECUTE_CONTEXT, is_gate: false, on_fail_jump_to: null, max_retries: 0, on_max_retries: 'pause', include_agents_md: true, instructions: `RULES:
- You are writing tests. Plan what to test first, then write the tests.
- Follow existing test patterns in the project.
- Do NOT modify production code -- only test files.
- Run the tests after writing them to make sure they pass.

Read the codebase to understand what needs testing. Follow existing test patterns. Write comprehensive tests for the described functionality.` },
      { ...VERIFY_STEP },
      { ...REVIEW_STEP },
    ],
  },
  {
    name: 'Doc Search',
    default_types: [],
    description: 'Search project documents and answer questions based on the results.',
    steps: [
      { name: 'answer', position: 1, model: 'sonnet', tools: ['Read', 'Grep', 'Glob', 'Bash'], context_sources: ['task_description', 'rag'], is_gate: false, on_fail_jump_to: null, max_retries: 0, on_max_retries: 'skip', include_agents_md: false, instructions: `Answer the user's question based on the document search results provided above. Cite which documents you're referencing. If the results don't contain enough information to answer fully, say so clearly.` },
    ],
  },
];
