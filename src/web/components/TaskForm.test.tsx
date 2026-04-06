// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskForm } from './TaskForm';
import type { Flow } from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getSkills: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../hooks/useSlashCommands', () => ({
  useSlashCommands: () => ({
    matches: [],
    activeIndex: 0,
    handleTextChange: vi.fn(),
    choose: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

function makeFlow(id: string, name: string, defaultTypes: string[]): Flow {
  return {
    id,
    project_id: 'project-1',
    name,
    description: '',
    icon: '',
    is_builtin: false,
    agents_md: null,
    default_types: defaultTypes,
    position: 1,
    created_at: '2026-04-06T00:00:00.000Z',
    flow_steps: [],
  };
}

function renderTaskForm(flows: Flow[]) {
  return render(
    <TaskForm
      workstreams={[]}
      members={[{ id: 'user-1', name: 'Pat Doe', initials: 'PD' }]}
      flows={flows}
      customTypes={[]}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onClose={() => {}}
    />,
  );
}

describe('TaskForm flow selection', () => {
  it('selects the preferred flow when flows arrive after mount', async () => {
    const { rerender } = renderTaskForm([]);

    const featureFlow = makeFlow('flow-feature', 'Feature Flow', ['feature']);
    const bugFlow = makeFlow('flow-bug', 'Bug Flow', ['bug-fix']);

    rerender(
      <TaskForm
        workstreams={[]}
        members={[{ id: 'user-1', name: 'Pat Doe', initials: 'PD' }]}
        flows={[featureFlow, bugFlow]}
        customTypes={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      const assigneeSelect = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;
      expect(assigneeSelect.value).toBe('flow:flow-feature');
    });
  });

  it('updates the selected flow when the type changes and preserves human assignments', async () => {
    const user = userEvent.setup();
    const featureFlow = makeFlow('flow-feature', 'Feature Flow', ['feature']);
    const bugFlow = makeFlow('flow-bug', 'Bug Flow', ['bug-fix']);

    const { rerender } = renderTaskForm([featureFlow, bugFlow]);

    const typeSelect = screen.getByRole('combobox', { name: 'Type' });
    const assigneeSelect = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;

    await waitFor(() => {
      expect(assigneeSelect.value).toBe('flow:flow-feature');
    });

    await user.selectOptions(typeSelect, 'bug-fix');
    expect(assigneeSelect.value).toBe('flow:flow-bug');

    await user.selectOptions(assigneeSelect, 'human:user-1');
    expect(assigneeSelect.value).toBe('human:user-1');

    rerender(
      <TaskForm
        workstreams={[]}
        members={[{ id: 'user-1', name: 'Pat Doe', initials: 'PD' }]}
        flows={[
          { ...featureFlow, position: 2 },
          { ...bugFlow, position: 1 },
        ]}
        customTypes={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement).value).toBe('human:user-1');
    });
  });
});
