// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowStepFormFields } from './FlowStepFormFields';
import type { FlowStep } from '../lib/api';
import type { AiRuntimeStatus } from '../../shared/ai-runtimes.js';

const step: FlowStep = {
  id: 'step-1',
  name: 'Research',
  position: 1,
  instructions: 'Read the docs and write a report.',
  runtime_kind: 'coding',
  runtime_id: 'claude_code',
  runtime_variant: 'sonnet',
  tools: ['Read'],
  context_sources: ['task_description'],
  use_project_data: false,
  is_gate: false,
  on_fail_jump_to: null,
  max_retries: 0,
  on_max_retries: 'pause',
};

const codingRuntimes: AiRuntimeStatus[] = [
  {
    id: 'claude_code',
    kind: 'coding',
    label: 'Claude Code',
    description: 'Claude runtime',
    command: 'claude',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: true,
    supportsMultiagent: true,
    variantOptions: [
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
    ],
    defaultVariant: 'opus',
    available: true,
    detectedPath: '/usr/bin/claude',
  },
  {
    id: 'codex',
    kind: 'coding',
    label: 'Codex',
    description: 'Codex runtime',
    command: 'codex',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: true,
    supportsMultiagent: false,
    variantOptions: [],
    defaultVariant: null,
    available: true,
    detectedPath: '/usr/bin/codex',
  },
  {
    id: 'qwen_code',
    kind: 'coding',
    label: 'Qwen Code',
    description: 'Qwen runtime',
    command: 'qwen',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: false,
    supportsMultiagent: false,
    variantOptions: [],
    defaultVariant: null,
    available: false,
    detectedPath: null,
  },
];

describe('FlowStepFormFields', () => {
  it('disables Project Data when the project has not configured it yet', () => {
    render(
      <FlowStepFormFields
        step={step}
        index={0}
        allSteps={[step]}
        isNew={false}
        projectDataEnabled={false}
        codingRuntimes={codingRuntimes}
        runtimeCatalogError={null}
        onUpdate={vi.fn()}
        onToggleTool={vi.fn()}
        onToggleContext={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect((screen.getByRole('checkbox', { name: 'Use Project Data' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Set up Project Data in project settings before enabling it on flow steps.')).toBeTruthy();
  });

  it('clears stale Project Data usage when the project settings disable it', async () => {
    const onUpdate = vi.fn();

    render(
      <FlowStepFormFields
        step={{ ...step, use_project_data: true }}
        index={0}
        allSteps={[step]}
        isNew={false}
        projectDataEnabled={false}
        codingRuntimes={codingRuntimes}
        runtimeCatalogError={null}
        onUpdate={onUpdate}
        onToggleTool={vi.fn()}
        onToggleContext={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ use_project_data: false });
    });
  });

  it('shows detected coding runtimes and marks unavailable ones as not installed', () => {
    render(
      <FlowStepFormFields
        step={step}
        index={0}
        allSteps={[step]}
        isNew={false}
        projectDataEnabled
        codingRuntimes={codingRuntimes}
        runtimeCatalogError={null}
        onUpdate={vi.fn()}
        onToggleTool={vi.fn()}
        onToggleContext={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Codex' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Qwen Code (not installed)' })).toBeTruthy();
  });
});
