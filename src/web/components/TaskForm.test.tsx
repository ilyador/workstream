// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskForm } from './TaskForm';
import type { Flow, ProviderConfig } from '../lib/api';
import type { EditTaskData } from './task-form-types';
import { useTaskFormState } from '../hooks/useTaskFormState';

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

function makeFlow(
  id: string,
  name: string,
  defaultTypes: string[],
  options: Partial<Flow> = {},
): Flow {
  return {
    id,
    project_id: 'project-1',
    name,
    description: '',
    icon: '',
    is_builtin: false,
    agents_md: null,
    default_types: defaultTypes,
    provider_binding: 'task_selected',
    position: 1,
    created_at: '2026-04-06T00:00:00.000Z',
    flow_steps: [],
    ...options,
  };
}

function makeProvider(id: string, provider: ProviderConfig['provider'], label: string): ProviderConfig {
  return {
    id,
    project_id: 'project-1',
    provider,
    label,
    base_url: null,
    is_enabled: true,
    supports_embeddings: false,
    embedding_model: null,
    model_suggestions: provider === 'claude' ? ['sonnet', 'opus'] : ['gpt-5.4', 'gpt-5.4-mini'],
    models: provider === 'claude' ? ['sonnet', 'opus'] : ['gpt-5.4', 'gpt-5.4-mini'],
    status: 'online',
    status_message: 'ok',
    has_api_key: false,
    embedding_dimensions: null,
  };
}

function renderTaskForm(flows: Flow[], providers: ProviderConfig[] = []) {
  return render(
    <TaskForm
      workstreams={[]}
      members={[{ id: 'user-1', name: 'Pat Doe', initials: 'PD' }]}
      flows={flows}
      providers={providers}
      customTypes={[]}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onClose={() => {}}
    />,
  );
}

function renderEditTaskForm({
  flows,
  providers = [],
  editTask,
  onSubmit = vi.fn().mockResolvedValue(undefined),
}: {
  flows: Flow[];
  providers?: ProviderConfig[];
  editTask: EditTaskData;
  onSubmit?: ReturnType<typeof vi.fn>;
}) {
  return {
    onSubmit,
    ...render(
      <TaskForm
        workstreams={[]}
        members={[{ id: 'user-1', name: 'Pat Doe', initials: 'PD' }]}
        flows={flows}
        providers={providers}
        customTypes={[]}
        editTask={editTask}
        onSubmit={onSubmit}
        onClose={() => {}}
      />
    ),
  };
}

function TaskFormStateHarness({ flows }: { flows: Flow[] }) {
  const { flowId, setFlowId } = useTaskFormState({
    flows,
    providers: [],
    customTypes: [],
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onClose: () => {},
  });

  return (
    <div>
      <div data-testid="flow-id">{flowId}</div>
      <button type="button" onClick={() => setFlowId('flow-bug')}>Choose Bug Flow</button>
    </div>
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

  it('keeps a human assignment when changing to a type without a preferred flow', async () => {
    const user = userEvent.setup();
    const featureFlow = makeFlow('flow-feature', 'Feature Flow', ['feature']);

    renderTaskForm([featureFlow]);

    const typeSelect = screen.getByRole('combobox', { name: 'Type' });
    const assigneeSelect = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;

    await waitFor(() => {
      expect(assigneeSelect.value).toBe('flow:flow-feature');
    });

    await user.selectOptions(assigneeSelect, 'human:user-1');
    expect(assigneeSelect.value).toBe('human:user-1');

    await user.selectOptions(typeSelect, 'chore');
    expect(assigneeSelect.value).toBe('human:user-1');
  });

  it('does not replace an existing flow selection when flows reload', async () => {
    const user = userEvent.setup();
    const featureFlow = makeFlow('flow-feature', 'Feature Flow', ['feature']);
    const bugFlow = makeFlow('flow-bug', 'Bug Flow', ['bug-fix']);

    const { rerender } = render(<TaskFormStateHarness flows={[featureFlow, bugFlow]} />);

    await waitFor(() => {
      expect(screen.getByTestId('flow-id').textContent).toBe('flow-feature');
    });

    await user.click(screen.getByRole('button', { name: 'Choose Bug Flow' }));
    expect(screen.getByTestId('flow-id').textContent).toBe('flow-bug');

    rerender(<TaskFormStateHarness flows={[featureFlow]} />);

    await waitFor(() => {
      expect(screen.getByTestId('flow-id').textContent).toBe('flow-bug');
    });
  });

  it('hides task-level model selection when the flow uses per-step model profiles', async () => {
    const profileFlow = makeFlow('flow-feature', 'Feature Flow', ['feature'], {
      flow_steps: [
        {
          id: 'step-1',
          name: 'Implement',
          position: 1,
          instructions: '',
          model: 'task:strong',
          tools: ['Read'],
          context_sources: ['task_description'],
          is_gate: false,
          on_fail_jump_to: null,
          max_retries: 0,
          on_max_retries: 'pause',
        },
        {
          id: 'step-2',
          name: 'Review',
          position: 2,
          instructions: '',
          model: 'task:balanced',
          tools: ['Read'],
          context_sources: ['task_description'],
          is_gate: false,
          on_fail_jump_to: null,
          max_retries: 0,
          on_max_retries: 'pause',
        },
      ],
    });

    renderTaskForm([profileFlow], [makeProvider('provider-claude', 'claude', 'Claude CLI')]);

    expect(screen.getByText('This flow uses per-step model profiles, so task-level model selection is unavailable.')).toBeTruthy();
    expect(screen.queryByLabelText('Model')).toBeNull();
  });

  it('shows task-level model selection when every step uses task:selected', async () => {
    const selectableFlow = makeFlow('flow-feature', 'Feature Flow', ['feature'], {
      flow_steps: [
        {
          id: 'step-1',
          name: 'Implement',
          position: 1,
          instructions: '',
          model: 'task:selected',
          tools: ['Read'],
          context_sources: ['task_description'],
          is_gate: false,
          on_fail_jump_to: null,
          max_retries: 0,
          on_max_retries: 'pause',
        },
      ],
    });

    renderTaskForm([selectableFlow], [makeProvider('provider-claude', 'claude', 'Claude CLI')]);

    expect(await screen.findByDisplayValue('sonnet')).toBeTruthy();
  });

  it('infers provider, model, reasoning, and subagents from flow-locked flows', async () => {
    const lockedFlow = makeFlow('flow-feature', 'Feature Flow', ['feature'], {
      provider_binding: 'flow_locked',
      flow_steps: [
        {
          id: 'step-1',
          name: 'Implement',
          position: 1,
          instructions: '',
          model: 'claude:sonnet',
          tools: ['Read'],
          context_sources: ['task_description'],
          is_gate: false,
          on_fail_jump_to: null,
          max_retries: 0,
          on_max_retries: 'pause',
        },
      ],
    });

    renderTaskForm([lockedFlow], [makeProvider('provider-claude', 'claude', 'Claude CLI')]);

    expect(screen.queryByLabelText('Provider')).toBeNull();
    expect(screen.queryByLabelText('Model')).toBeNull();
    expect(screen.queryByText('Reasoning')).toBeNull();
    expect(screen.queryByText('Use subagents')).toBeNull();
    expect(screen.getByText('Provider and model are locked by this flow.')).toBeTruthy();
  });

  it('hides reasoning and subagent controls when the chosen model does not support them', async () => {
    const selectableFlow = makeFlow('flow-feature', 'Feature Flow', ['feature'], {
      flow_steps: [
        {
          id: 'step-1',
          name: 'Implement',
          position: 1,
          instructions: '',
          model: 'task:selected',
          tools: ['Read'],
          context_sources: ['task_description'],
          is_gate: false,
          on_fail_jump_to: null,
          max_retries: 0,
          on_max_retries: 'pause',
        },
      ],
    });

    renderTaskForm([selectableFlow], [makeProvider('provider-codex', 'codex', 'Codex CLI')]);

    const modelInput = await screen.findByDisplayValue('gpt-5.4');
    fireEvent.change(modelInput, { target: { value: 'custom-experimental-model' } });

    await waitFor(() => {
      expect(screen.queryByText('Reasoning')).toBeNull();
      expect(screen.queryByText('Use subagents')).toBeNull();
      expect(screen.getByText('The resolved provider/model for this flow does not expose task-level reasoning.')).toBeTruthy();
    });
  });

  it('preserves locked execution settings when editing a task', async () => {
    const user = userEvent.setup();
    const lockedFlow = makeFlow('flow-locked', 'Locked Flow', ['feature'], {
      provider_binding: 'flow_locked',
      flow_steps: [
        {
          id: 'step-1',
          name: 'Implement',
          position: 1,
          instructions: '',
          model: 'claude:sonnet',
          provider_config_id: 'provider-claude',
          tools: ['Read'],
          context_sources: ['task_description'],
          is_gate: false,
          on_fail_jump_to: null,
          max_retries: 0,
          on_max_retries: 'pause',
        },
      ],
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderEditTaskForm({
      flows: [lockedFlow],
      providers: [makeProvider('provider-claude', 'claude', 'Claude CLI')],
      editTask: {
        id: 'task-1',
        title: 'Locked task',
        description: 'Original',
        type: 'feature',
        mode: 'ai',
        effort: 'high',
        multiagent: 'yes',
        assignee: null,
        flow_id: 'flow-locked',
        provider_config_id: 'provider-claude',
        provider_model: 'sonnet',
        execution_settings_locked_at: '2026-04-08T10:00:00.000Z',
        auto_continue: true,
        images: [],
        priority: 'backlog',
        chaining: 'none',
      },
      onSubmit,
    });

    await user.clear(screen.getByPlaceholderText('Task title'));
    await user.type(screen.getByPlaceholderText('Task title'), 'Locked task updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Locked task updated',
        effort: 'high',
        multiagent: 'yes',
        provider_config_id: 'provider-claude',
        provider_model: 'sonnet',
      }));
    });
  });

  it('disables custom-type controls when execution settings are locked', () => {
    const selectableFlow = makeFlow('flow-feature', 'Feature Flow', ['feature']);

    renderEditTaskForm({
      flows: [selectableFlow],
      editTask: {
        id: 'task-1',
        title: 'Locked custom task',
        description: '',
        type: 'deploy',
        mode: 'ai',
        effort: 'max',
        multiagent: 'auto',
        assignee: null,
        flow_id: 'flow-feature',
        provider_config_id: null,
        provider_model: null,
        execution_settings_locked_at: '2026-04-08T10:00:00.000Z',
        auto_continue: true,
        images: [],
        priority: 'backlog',
        chaining: 'none',
      },
    });

    expect((screen.getByPlaceholderText('e.g. docs, spike, deploy') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Custom type pipeline') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '×' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
