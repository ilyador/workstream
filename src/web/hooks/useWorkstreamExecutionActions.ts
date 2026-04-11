import { useCallback } from 'react';
import { createWorkstreamPr, reviewAndCreatePr } from '../lib/api';
import type {
  ExecutionActionContext,
  ExecutionTasksResource,
  ExecutionWorkstreamsResource,
} from './execution-action-types';
import { getErrorMessage } from './execution-action-utils';

interface UseWorkstreamExecutionActionsParams extends Pick<ExecutionActionContext, 'localPath' | 'modal'> {
  tasks: ExecutionTasksResource;
  workstreams: ExecutionWorkstreamsResource;
}

export function useWorkstreamExecutionActions({
  localPath,
  modal,
  tasks,
  workstreams,
}: UseWorkstreamExecutionActionsParams) {
  const createPr = useCallback(async (workstreamId: string, options?: { review?: boolean }) => {
    try {
      if (options?.review) {
        await reviewAndCreatePr(workstreamId, localPath || '');
        await workstreams.reload();
      } else {
        const result = await createWorkstreamPr(workstreamId, localPath || '');
        if (result.prUrl) {
          await workstreams.reload();
        }
      }
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed'));
    }
  }, [localPath, modal, workstreams]);

  const deleteWorkstreamAndReloadTasks = useCallback(async (workstreamId: string) => {
    await workstreams.deleteWorkstream(workstreamId);
    await tasks.reload();
  }, [tasks, workstreams]);

  return {
    createPr,
    deleteWorkstreamAndReloadTasks,
  };
}
