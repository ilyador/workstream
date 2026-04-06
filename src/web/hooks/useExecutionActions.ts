import { useCallback } from 'react';
import {
  approveJob,
  continueJob,
  createWorkstreamPr,
  deleteJob,
  moveToBacklog,
  rejectJob,
  replyToJob,
  reworkJob,
  reviewAndCreatePr,
  runTaskApi,
  terminateJob,
} from '../lib/api';
import type { ModalContextValue } from './modal-context';
import type { TaskRecord } from '../lib/api';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface UseExecutionActionsParams {
  projectId: string | null;
  localPath?: string | null;
  modal: ModalContextValue;
  tasks: {
    tasks: TaskRecord[];
    reload: () => Promise<unknown>;
  };
  jobs: {
    reload: () => Promise<unknown>;
  };
  workstreams: {
    reload: () => Promise<unknown>;
    deleteWorkstream: (id: string) => Promise<void>;
  };
}

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

  const requireExecutionContext = useCallback(async () => {
    if (!projectId || !localPath) {
      await modal.alert('Missing path', 'Set a local folder path for this project first.');
      return null;
    }

    return { projectId, localPath };
  }, [localPath, modal, projectId]);

  const runWorkstream = useCallback(async (workstreamId: string) => {
    const context = await requireExecutionContext();
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
  }, [modal, reloadTaskState, requireExecutionContext, tasks.tasks]);

  const runTask = useCallback(async (taskId: string) => {
    const context = await requireExecutionContext();
    if (!context) return;

    try {
      await runTaskApi(taskId, context.projectId, context.localPath, false);
      await reloadTaskState();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to start task'));
    }
  }, [modal, reloadTaskState, requireExecutionContext]);

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
    if (!projectId || !localPath) {
      await modal.alert('Missing path', 'Set a local folder path for this project first.');
      return;
    }

    try {
      await reworkJob(jobId, note, projectId, localPath);
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

  const createPr = useCallback(async (workstreamId: string, options?: { review?: boolean }) => {
    try {
      if (options?.review) {
        await reviewAndCreatePr(workstreamId, localPath || '');
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
    runWorkstream,
    runTask,
    terminate,
    reply,
    approve,
    reject,
    rework,
    dismissJob,
    sendToBacklog,
    continueExecution,
    createPr,
    deleteWorkstreamAndReloadTasks,
  };
}
