import { useCallback } from 'react';
import type { UseExecutionActionsParams } from './execution-action-types';
import { useJobLifecycleActions } from './useJobLifecycleActions';
import { useTaskRunActions } from './useTaskRunActions';
import { useWorkstreamExecutionActions } from './useWorkstreamExecutionActions';

export function useExecutionActions({
  projectId,
  localPath,
  modal,
  tasks,
  jobs,
  workstreams,
}: UseExecutionActionsParams) {
  const reloadTaskState = useCallback(async () => {
    await Promise.all([jobs.reload(), tasks.reload()]);
  }, [jobs, tasks]);

  return {
    ...useTaskRunActions({
      projectId,
      localPath,
      modal,
      tasks,
      reloadTaskState,
    }),
    ...useJobLifecycleActions({
      projectId,
      localPath,
      modal,
      jobs,
      reloadTaskState,
    }),
    ...useWorkstreamExecutionActions({
      localPath,
      modal,
      tasks,
      workstreams,
    }),
  };
}
