// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowEditor } from './FlowEditor';
import { ModalContext, type ModalContextValue } from '../hooks/modal-context';
import type { Flow } from '../lib/api';

const { useCommentsMock, useArtifactsMock } = vi.hoisted(() => ({
  useCommentsMock: vi.fn(() => ({
    comments: [],
    loaded: true,
    addComment: vi.fn(),
    removeComment: vi.fn(),
  })),
  useArtifactsMock: vi.fn(() => ({
    artifacts: [],
    loading: false,
    loaded: true,
    upload: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  })),
}));

vi.mock('../hooks/useAiRuntimes', () => ({
  useAiRuntimes: () => ({
    runtimes: [
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
    ],
    loading: false,
    error: null,
    ready: true,
    reload: vi.fn(),
  }),
}));

vi.mock('../hooks/useComments', () => ({
  useComments: useCommentsMock,
}));

vi.mock('../hooks/useArtifacts', () => ({
  useArtifacts: useArtifactsMock,
}));

function makeFlow(): Flow {
  return {
    id: 'flow-1',
    project_id: 'project-1',
    name: 'Spec Flow',
    description: 'Flow for writing specs',
    icon: '',
    is_builtin: false,
    agents_md: null,
    default_types: ['feature'],
    position: 1,
    created_at: '2026-04-06T00:00:00.000Z',
    flow_steps: [
      {
        id: 'step-1',
        name: 'Draft spec',
        position: 1,
        instructions: 'Write the first draft.',
        runtime_kind: 'coding',
        runtime_id: 'claude_code',
        runtime_variant: 'sonnet',
        tools: ['Read', 'Write'],
        context_sources: ['task_description'],
        use_project_data: false,
        is_gate: false,
        on_fail_jump_to: null,
        max_retries: 0,
        on_max_retries: 'pause',
      },
    ],
  };
}

const modalValue: ModalContextValue = {
  alert: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(false),
};

describe('FlowEditor flow step rendering', () => {
  it('renders flow steps without mounting task-only comments or artifact hooks', () => {
    render(
      <ModalContext.Provider value={modalValue}>
        <FlowEditor
          flows={[makeFlow()]}
          setFlows={vi.fn()}
          projectDataEnabled
          onSave={vi.fn().mockResolvedValue(undefined)}
          onSaveSteps={vi.fn().mockResolvedValue(undefined)}
          onCreateFlow={vi.fn()}
          onDeleteFlow={vi.fn().mockResolvedValue(undefined)}
          onSwapColumns={vi.fn()}
          projectId="project-1"
          taskTypes={['feature']}
        />
      </ModalContext.Provider>,
    );

    expect(screen.getByText('Draft spec')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('Sonnet')).toBeTruthy();
    expect(useCommentsMock).not.toHaveBeenCalled();
    expect(useArtifactsMock).not.toHaveBeenCalled();
  });
});
