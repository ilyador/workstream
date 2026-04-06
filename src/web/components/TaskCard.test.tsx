// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCard } from './TaskCard';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';

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
