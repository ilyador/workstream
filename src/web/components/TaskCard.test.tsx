// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCard } from './TaskCard';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';

const { useCommentsMock, useArtifactsMock } = vi.hoisted(() => ({
  useCommentsMock: vi.fn((...args: [string | null, string?]) => {
    void args;
    return {
      comments: [],
      loaded: true,
      loading: false,
      error: null as string | null,
      addComment: vi.fn(),
      removeComment: vi.fn(),
    };
  }),
  useArtifactsMock: vi.fn((...args: [string | null, string?]) => {
    void args;
    return {
      artifacts: [],
      loading: false,
      loaded: true,
      error: null as string | null,
      upload: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    };
  }),
}));

vi.mock('../hooks/modal-context', () => ({
  useModal: () => ({
    confirm: vi.fn(async () => true),
    alert: vi.fn(async () => {}),
  }),
}));

vi.mock('../hooks/useComments', () => ({
  useComments: useCommentsMock,
}));

vi.mock('../hooks/useArtifacts', () => ({
  useArtifacts: useArtifactsMock,
}));

function makeTask(): TaskView {
  return {
    id: 'task-1',
    title: 'Review task',
    description: 'Check the implementation',
    type: 'feature',
    mode: 'ai',
    effort: 'high',
    auto_continue: true,
    status: 'review',
  };
}

function makeReviewJob(review: JobView['review']): JobView {
  return {
    id: 'job-1',
    taskId: 'task-1',
    title: 'Review task',
    type: 'task',
    status: 'review',
    attempt: 1,
    maxAttempts: 3,
    review,
  };
}

describe('TaskCard review checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommentsMock.mockReturnValue({
      comments: [],
      loaded: true,
      loading: false,
      error: null as string | null,
      addComment: vi.fn(),
      removeComment: vi.fn(),
    });
    useArtifactsMock.mockReturnValue({
      artifacts: [],
      loading: false,
      loaded: true,
      error: null as string | null,
      upload: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    });
  });

  it('does not mount comments or artifacts for a collapsed idle card', () => {
    render(
      <TaskCard
        task={{
          ...makeTask(),
          status: 'backlog',
          mode: 'ai',
        }}
        job={null}
        canRunAi
        isExpanded={false}
        onToggleExpand={() => {}}
      />,
    );

    expect(useCommentsMock).not.toHaveBeenCalled();
    expect(useArtifactsMock).not.toHaveBeenCalled();
  });

  it('renders an expanded idle card without referencing removed local comment state', () => {
    render(
      <TaskCard
        task={{
          ...makeTask(),
          status: 'backlog',
          mode: 'ai',
        }}
        job={null}
        canRunAi
        isExpanded
        onToggleExpand={() => {}}
      />,
    );

    expect(useCommentsMock).toHaveBeenCalled();
    expect(screen.getByText('Comments')).toBeTruthy();
  });

  it('keeps comment loading from flashing the empty state', () => {
    useCommentsMock.mockReturnValue({
      comments: [],
      loaded: false,
      loading: true,
      error: null as string | null,
      addComment: vi.fn(),
      removeComment: vi.fn(),
    });

    render(
      <TaskCard
        task={{
          ...makeTask(),
          status: 'backlog',
          mode: 'ai',
        }}
        job={null}
        canRunAi
        isExpanded
        onToggleExpand={() => {}}
      />,
    );

    expect(screen.getByText('Loading comments...')).toBeTruthy();
    expect(screen.queryByText('No comments yet')).toBeNull();
  });

  it('does not show missing-file warnings while required artifacts are loading', () => {
    useArtifactsMock.mockImplementation((taskId: string | null) => ({
      artifacts: [],
      loading: taskId === 'prev-task',
      loaded: taskId !== 'prev-task',
      error: null as string | null,
      upload: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    }));

    render(
      <TaskCard
        task={{
          ...makeTask(),
          status: 'backlog',
          mode: 'ai',
          chaining: 'accept',
        }}
        job={null}
        canRunAi
        isExpanded
        isBacklog
        onToggleExpand={() => {}}
        onUpdateTask={() => {}}
        prevTaskId="prev-task"
      />,
    );

    expect(screen.queryByText('Awaiting file from previous task')).toBeNull();
    expect(screen.getByRole('button', { name: 'Complete' }).getAttribute('title')).toBe('Checking required files...');
  });

  it('shows missing-file warnings after required artifact checks finish empty', () => {
    render(
      <TaskCard
        task={{
          ...makeTask(),
          status: 'backlog',
          mode: 'ai',
          chaining: 'accept',
        }}
        job={null}
        canRunAi
        isExpanded
        isBacklog
        onToggleExpand={() => {}}
        onUpdateTask={() => {}}
        prevTaskId="prev-task"
      />,
    );

    expect(screen.getByText('Awaiting file from previous task')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Complete' }).getAttribute('title')).toBe('Awaiting file from previous task');
  });

  it('blocks completion when required artifact checks fail', () => {
    useArtifactsMock.mockImplementation((taskId: string | null) => ({
      artifacts: [],
      loading: false,
      loaded: false,
      error: taskId === 'prev-task' ? 'Network error' : null,
      upload: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    }));

    render(
      <TaskCard
        task={{
          ...makeTask(),
          status: 'backlog',
          mode: 'ai',
          chaining: 'accept',
        }}
        job={null}
        canRunAi
        isExpanded
        isBacklog
        onToggleExpand={() => {}}
        onUpdateTask={() => {}}
        prevTaskId="prev-task"
      />,
    );

    const completeButton = screen.getByRole('button', { name: 'Complete' });
    expect(screen.getByText('Failed to check previous task file')).toBeTruthy();
    expect(completeButton).toHaveProperty('disabled', true);
  });

  it('shows the tests badge only when testsPassed is explicitly true', () => {
    render(
      <TaskCard
        task={makeTask()}
        job={makeReviewJob({
          filesChanged: 3,
          testsPassed: true,
          linesAdded: 10,
          linesRemoved: 2,
          summary: 'Looks good',
          changedFiles: ['src/web/App.tsx'],
        })}
        canRunAi
        isExpanded
        onToggleExpand={() => {}}
      />,
    );

    expect(screen.getByText(/Tests pass/)).toBeTruthy();
    expect(screen.queryByText('Architecture rules pass')).toBeNull();
  });

  it('does not fabricate a passing tests badge from changed files alone', () => {
    render(
      <TaskCard
        task={makeTask()}
        job={makeReviewJob({
          filesChanged: 2,
          linesAdded: 10,
          linesRemoved: 4,
          summary: 'Needs work',
          changedFiles: ['src/web/components/TaskCard.tsx'],
        })}
        canRunAi
        isExpanded
        onToggleExpand={() => {}}
      />,
    );

    expect(screen.queryByText('Tests pass')).toBeNull();
    expect(screen.queryByText('Architecture rules pass')).toBeNull();
  });
});
