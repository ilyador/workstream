import { useCallback } from 'react';
import {
  approveJob,
  continueJob,
  deleteJob,
  moveToBacklog,
  rejectJob,
  replyToJob,
  reworkJob,
  terminateJob,
} from '../lib/api';
import type { ExecutionActionContext, ExecutionJobsResource } from './execution-action-types';
import { getErrorMessage, requireExecutionContext } from './execution-action-utils';

interface UseJobLifecycleActionsParams extends ExecutionActionContext {
  jobs: ExecutionJobsResource;
  reloadTaskState: () => Promise<void>;
}

export function useJobLifecycleActions({
  projectId,
  localPath,
  modal,
  jobs,
  reloadTaskState,
}: UseJobLifecycleActionsParams) {
  const terminate = useCallback(async (jobId: string) => {
    if (!(await modal.confirm('Terminate job', 'Terminate this running job?', { label: 'Terminate', danger: true }))) {
      return;
    }

    await terminateJob(jobId);
    await reloadTaskState();
  }, [modal, reloadTaskState]);

  const reply = useCallback(async (jobId: string, answer: string) => {
    try {
      await replyToJob(jobId, answer, localPath || '');
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to send reply'));
    }
  }, [localPath, modal, reloadTaskState]);

  const approve = useCallback(async (jobId: string) => {
    try {
      await approveJob(jobId);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to approve'));
    }
  }, [modal, reloadTaskState]);

  const reject = useCallback(async (jobId: string) => {
    try {
      await rejectJob(jobId);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to reject'));
    }
  }, [modal, reloadTaskState]);

  const rework = useCallback(async (jobId: string, note: string) => {
    const context = await requireExecutionContext({ projectId, localPath, modal });
    if (!context) return;

    try {
      await reworkJob(jobId, note, context.projectId, context.localPath);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to rework'));
    }
  }, [localPath, modal, projectId, reloadTaskState]);

  const dismissJob = useCallback(async (jobId: string) => {
    try {
      await deleteJob(jobId);
      await jobs.reload();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to dismiss job'));
    }
  }, [jobs, modal]);

  const sendToBacklog = useCallback(async (jobId: string) => {
    try {
      await moveToBacklog(jobId);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to move to backlog'));
    }
  }, [modal, reloadTaskState]);

  const continueExecution = useCallback(async (jobId: string) => {
    try {
      await continueJob(jobId);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to continue job'));
    }
  }, [modal, reloadTaskState]);

  return {
    terminate,
    reply,
    approve,
    reject,
    rework,
    dismissJob,
    sendToBacklog,
    continueExecution,
  };
}
