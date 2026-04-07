import { useCallback } from 'react';
import { runTaskApi } from '../lib/api';
import type { ExecutionActionContext, ExecutionTasksResource } from './execution-action-types';
import { getErrorMessage, requireExecutionContext } from './execution-action-utils';

interface UseTaskRunActionsParams extends ExecutionActionContext {
  tasks: ExecutionTasksResource;
  reloadTaskState: () => Promise<void>;
}

export function useTaskRunActions({
  projectId,
  localPath,
  modal,
  tasks,
  reloadTaskState,
}: UseTaskRunActionsParams) {
  const runWorkstream = useCallback(async (workstreamId: string) => {
    const context = await requireExecutionContext({ projectId, localPath, modal });
    if (!context) return;

    const workstreamTasks = tasks.tasks
      .filter(task => task.workstream_id === workstreamId && ['backlog', 'todo'].includes(task.status) && task.mode === 'ai')
      .sort((a, b) => a.position - b.position);

    if (workstreamTasks.length === 0) {
      await modal.alert('No tasks', 'No runnable AI tasks in this workstream.');
      return;
    }

    try {
      await runTaskApi(workstreamTasks[0].id, context.projectId, context.localPath, true);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to start workstream'));
    }
  }, [localPath, modal, projectId, reloadTaskState, tasks.tasks]);

  const runTask = useCallback(async (taskId: string) => {
    const context = await requireExecutionContext({ projectId, localPath, modal });
    if (!context) return;

    try {
      await runTaskApi(taskId, context.projectId, context.localPath, false);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to start task'));
    }
  }, [localPath, modal, projectId, reloadTaskState]);

  return {
    runWorkstream,
    runTask,
  };
}
