import type { JobView } from '../components/job-types';
import type { TaskView } from './task-view';

export interface ArtifactSnapshot {
  count: number;
  loaded: boolean;
  error?: string | null;
}

export interface TaskFileDependency {
  previousTask: TaskView | null;
  previousJobStatus?: JobView['status'] | null;
}

export type FileGateReason =
  | 'missing-previous-task'
  | 'previous-task-pending'
  | 'previous-file-check-failed'
  | 'previous-file-loading'
  | 'previous-file-missing'
  | 'output-file-check-failed'
  | 'output-file-loading'
  | 'output-file-missing';

export interface TaskFileGate {
  blocked: boolean;
  checking: boolean;
  reason: FileGateReason | null;
  message: string;
}

export function taskAcceptsFiles(task: Pick<TaskView, 'chaining'>) {
  return task.chaining === 'accept' || task.chaining === 'both';
}

export function taskProducesFiles(task: Pick<TaskView, 'chaining'>) {
  return task.chaining === 'produce' || task.chaining === 'both';
}

export function isTaskApprovedForFilePassing(
  task: Pick<TaskView, 'status'> | null | undefined,
  jobStatus?: JobView['status'] | null,
) {
  return task?.status === 'done' || jobStatus === 'done';
}

export function buildTaskFileDependency(
  previousTask: TaskView | null | undefined,
  previousJobStatus?: JobView['status'] | null,
): TaskFileDependency {
  return {
    previousTask: previousTask ?? null,
    previousJobStatus: previousTask ? previousJobStatus ?? null : null,
  };
}

export function getTaskFileGate({
  task,
  dependency,
  ownArtifacts,
  previousArtifacts,
}: {
  task: Pick<TaskView, 'chaining'>;
  dependency?: TaskFileDependency | null;
  ownArtifacts: ArtifactSnapshot;
  previousArtifacts: ArtifactSnapshot;
}): TaskFileGate {
  const needsInput = taskAcceptsFiles(task);
  const needsOutput = taskProducesFiles(task);
  const previousTask = dependency?.previousTask ?? null;
  const previousTaskApproved = isTaskApprovedForFilePassing(previousTask, dependency?.previousJobStatus);

  if (needsInput && !previousTask) {
    return fileGate('missing-previous-task', true, false, 'Previous task file is unavailable');
  }

  if (needsInput && !previousTaskApproved) {
    return fileGate('previous-task-pending', true, false, 'Awaiting previous task approval');
  }

  if (needsInput && previousArtifacts.error) {
    return fileGate('previous-file-check-failed', true, false, 'Failed to check previous task file');
  }

  if (needsInput && !previousArtifacts.loaded) {
    return fileGate('previous-file-loading', true, true, 'Checking required files...');
  }

  if (needsInput && previousArtifacts.count === 0) {
    return fileGate('previous-file-missing', true, false, 'Awaiting file from previous task');
  }

  if (needsOutput && ownArtifacts.error) {
    return fileGate('output-file-check-failed', true, false, 'Failed to check required files');
  }

  if (needsOutput && !ownArtifacts.loaded) {
    return fileGate('output-file-loading', true, true, 'Checking required files...');
  }

  if (needsOutput && ownArtifacts.count === 0) {
    return fileGate('output-file-missing', true, false, 'Attach a file before completing');
  }

  return fileGate(null, false, false, '');
}

export function hasFileAwaitingApproval({
  task,
  jobStatus,
  ownArtifacts,
}: {
  task: Pick<TaskView, 'chaining'>;
  jobStatus?: JobView['status'] | null;
  ownArtifacts: ArtifactSnapshot;
}) {
  return taskProducesFiles(task) && jobStatus === 'review' && ownArtifacts.loaded && ownArtifacts.count > 0;
}

function fileGate(reason: FileGateReason | null, blocked: boolean, checking: boolean, message: string): TaskFileGate {
  return { reason, blocked, checking, message };
}
