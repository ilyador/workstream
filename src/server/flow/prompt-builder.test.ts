import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com' } })),
      })),
    },
  },
}));

vi.mock('../routes/data.js', () => ({
  discoverSkills: vi.fn().mockReturnValue([]),
}));

vi.mock('../git-utils.js', () => ({
  stagedDiff: vi.fn().mockReturnValue(''),
}));

const testDir = join(tmpdir(), `prompt-builder-test-${Date.now()}`);

function baseStep(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    name: 'Code',
    runtime_kind: 'coding',
    runtime_id: 'claude_code',
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
    max_retries: 0,
    is_gate: false,
    on_fail_jump_to: null,
    on_max_retries: 'fail',
    position: 0,
    instructions: 'Do the thing',
    use_project_data: false,
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

function baseFlow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'f1', name: 'Default', steps: [], agents_md: null, ...overrides } as unknown as import('../flow-config.js').FlowConfig;
}

function baseTask(overrides: Record<string, unknown> = {}) {
  return { id: 't1', title: 'Sample task', description: null, ...overrides };
}

describe('buildStepPrompt', () => {
  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  it('reads CLAUDE.md when agents context source is requested and CLAUDE.md exists', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Repo instructions\nDo X.');
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['agents'] });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);
    expect(prompt).toContain('## Repository Instructions');
    expect(prompt).toContain('# Repo instructions');
  });

  it('prefers AGENTS.md over CLAUDE.md when both exist', async () => {
    writeFileSync(join(testDir, 'AGENTS.md'), '# From agents.md');
    writeFileSync(join(testDir, 'CLAUDE.md'), '# From claude.md');
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['agents'] });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);
    expect(prompt).toContain('# From agents.md');
    expect(prompt).not.toContain('# From claude.md');
  });

  it('omits the agents block silently when neither file exists', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['agents'] });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);
    expect(prompt).not.toContain('## Repository Instructions');
  });

  it('includes task title and description when task_description source is set', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['task_description'] });
    const task = baseTask({ title: 'My task', description: 'Do it carefully.' });
    const prompt = await buildStepPrompt(step, baseFlow(), task, [], testDir);
    expect(prompt).toContain('## Task');
    expect(prompt).toContain('Title: My task');
    expect(prompt).toContain('Description: Do it carefully.');
  });

  it('falls back to No description provided. when task.description is null', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['task_description'] });
    const task = baseTask({ title: 'T', description: null });
    const prompt = await buildStepPrompt(step, baseFlow(), task, [], testDir);
    expect(prompt).toContain('No description provided.');
  });

  it('includes gate_feedback block when task._gateFeedback is set', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['gate_feedback'] });
    const task = baseTask();
    (task as any)._gateFeedback = 'verify failed: tests broken';
    const prompt = await buildStepPrompt(step, baseFlow(), task, [], testDir);
    expect(prompt).toContain('Previous Step Feedback');
    expect(prompt).toContain('verify failed: tests broken');
  });

  it('omits gate_feedback block silently when task._gateFeedback is absent', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['gate_feedback'] });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);
    expect(prompt).not.toContain('Previous Step Feedback');
  });

  it('includes git_diff block when stagedDiff returns content', async () => {
    const { stagedDiff } = await import('../git-utils.js');
    vi.mocked(stagedDiff).mockReturnValueOnce('diff --git a/foo b/foo\n+added');
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ context_sources: ['git_diff'] });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);
    expect(prompt).toContain('## Git Diff (changes made)');
    expect(prompt).toContain('+added');
  });

  it('always ends with the one-line summary instruction', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep();
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);
    expect(prompt).toContain('[summary] Your short summary here');
  });

  it('includes the human answer block when answer is provided', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep();
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir, 'Yes, do X.');
    expect(prompt).toContain('## Human Answer to Your Question');
    expect(prompt).toContain('Yes, do X.');
  });

  it('adds an unattended execution contract for non-gate coding steps', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ name: 'develop' });
    const previousOutputs = [{ phase: 'plan', attempt: 1, output: 'Implement the filter in the board toolbar.' }];
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), previousOutputs, testDir);

    expect(prompt).toContain('## Execution Contract');
    expect(prompt).toContain('Do not ask the user clarification questions.');
    expect(prompt).toContain('Do not respond with "Before I begin" or a list of questions.');
    expect(prompt).toContain('Previous step outputs are binding context.');
    expect(prompt).toContain('implement that plan directly');
    expect(prompt).toContain('Ignore any previous-plan instruction that asks for subagents, skills, TodoWrite/todo lists');
    expect(prompt).toContain('Do not create a new plan or task checklist');
  });

  it('lists the current step tools in the execution contract', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ tools: ['Read', 'Edit', 'Write', 'Bash'] });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);

    expect(prompt).toContain('Use only these step tools: Read, Edit, Write, Bash.');
    expect(prompt).toContain('Do not attempt tools that are not listed.');
  });

  it('does not add the unattended execution contract for gate steps', async () => {
    const { buildStepPrompt } = await import('./prompt-builder.js');
    const step = baseStep({ name: 'verify', is_gate: true });
    const prompt = await buildStepPrompt(step, baseFlow(), baseTask(), [], testDir);

    expect(prompt).not.toContain('## Execution Contract');
    expect(prompt).not.toContain('Do not ask the user clarification questions.');
  });
});
