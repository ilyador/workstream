// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowStepFormFields } from './FlowStepFormFields';
import type { FlowStep } from '../lib/api';

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

describe('FlowStepFormFields', () => {
  it('disables Project Data when the project has not configured it yet', () => {
    render(
      <FlowStepFormFields
        step={step}
        index={0}
        allSteps={[step]}
        isNew={false}
        projectDataEnabled={false}
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
});
