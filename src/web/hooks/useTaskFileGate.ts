import type { JobView } from '../components/job-types';
import {
  getTaskFileGate,
  hasFileAwaitingApproval,
  type ArtifactSnapshot,
  type TaskFileDependency,
} from '../lib/file-passing';
import type { TaskView } from '../lib/task-view';
import { useArtifacts, type ArtifactsData } from './useArtifacts';

export function useTaskFileGate({
  task,
  jobStatus,
  projectId,
  dependency,
}: {
  task: TaskView;
  jobStatus?: JobView['status'] | null;
  projectId?: string;
  dependency?: TaskFileDependency | null;
}) {
  const ownArtifacts = useArtifacts(task.id, projectId);
  const previousTaskId = dependency?.previousTask?.id ?? null;
  const previousArtifacts = useArtifacts(previousTaskId, projectId);
  const ownSnapshot = toArtifactSnapshot(ownArtifacts);
  const previousSnapshot = toArtifactSnapshot(previousArtifacts);

  const gate = getTaskFileGate({
    task,
    dependency,
    ownArtifacts: ownSnapshot,
    previousArtifacts: previousSnapshot,
  });

  const fileAwaitingApproval = hasFileAwaitingApproval({
    task,
    jobStatus,
    ownArtifacts: ownSnapshot,
  });

  return {
    gate,
    ownArtifacts,
    previousArtifacts,
    fileAwaitingApproval,
  };
}

function toArtifactSnapshot(artifacts: ArtifactsData): ArtifactSnapshot {
  return {
    count: artifacts.artifacts.length,
    loaded: artifacts.loaded,
    error: artifacts.error,
  };
}
