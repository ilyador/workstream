import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotAction } from './bot-action-types.js';

const createTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const addCommentMock = vi.fn();

vi.mock('./bot-task-actions.js', () => ({
  createTask: (action: BotAction, projectId: string) => createTaskMock(action, projectId),
  updateTask: (action: BotAction, projectId: string) => updateTaskMock(action, projectId),
  addComment: (action: BotAction, projectId: string) => addCommentMock(action, projectId),
}));

describe('bot-actions dispatcher', () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    updateTaskMock.mockReset();
    addCommentMock.mockReset();
  });

  it('dispatches create_task to createTask with the action and projectId', async () => {
    createTaskMock.mockResolvedValue('Created task "A" (abc)');
    const { executeAction } = await import('./bot-actions.js');
    const result = await executeAction({ name: 'create_task', params: { title: 'A' } }, 'project-1');
    expect(result).toBe('Created task "A" (abc)');
    expect(createTaskMock).toHaveBeenCalledWith(
      { name: 'create_task', params: { title: 'A' } },
      'project-1',
    );
    expect(updateTaskMock).not.toHaveBeenCalled();
    expect(addCommentMock).not.toHaveBeenCalled();
  });

  it('dispatches update_task to updateTask', async () => {
    updateTaskMock.mockResolvedValue('Updated task t-1');
    const { executeAction } = await import('./bot-actions.js');
    const result = await executeAction({ name: 'update_task', params: { task_id: 't-1' } }, 'project-1');
    expect(result).toBe('Updated task t-1');
    expect(updateTaskMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches add_comment to addComment', async () => {
    addCommentMock.mockResolvedValue('Added comment');
    const { executeAction } = await import('./bot-actions.js');
    const result = await executeAction({ name: 'add_comment', params: { task_id: 't-1', body: 'hi' } }, 'project-1');
    expect(result).toBe('Added comment');
    expect(addCommentMock).toHaveBeenCalledTimes(1);
  });

  it('returns a descriptive fallback string for unknown action names without calling any handler', async () => {
    const { executeAction } = await import('./bot-actions.js');
    const result = await executeAction({ name: 'evil_action', params: { x: 1 } }, 'project-1');
    expect(result).toBe('Unknown action: evil_action');
    expect(createTaskMock).not.toHaveBeenCalled();
    expect(updateTaskMock).not.toHaveBeenCalled();
    expect(addCommentMock).not.toHaveBeenCalled();
  });

  it('does not dispatch prototype-chain names even if they slip through parsing', async () => {
    const { executeAction } = await import('./bot-actions.js');
    for (const name of ['__proto__', 'constructor', 'toString']) {
      const result = await executeAction({ name, params: {} }, 'project-1');
      expect(result).toBe(`Unknown action: ${name}`);
    }
    expect(createTaskMock).not.toHaveBeenCalled();
  });
});
