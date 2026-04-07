import { useCommentCounts } from './useCommentCounts';
import { useCustomTypes } from './useCustomTypes';
import { useFlows } from './useFlows';
import { useJobs } from './useJobs';
import { useMembers } from './useMembers';
import { useTasks } from './useTasks';
import { useWorkstreams } from './useWorkstreams';

export function useCurrentProjectResources(projectId: string | null) {
  const tasks = useTasks(projectId);
  const jobs = useJobs(projectId);
  const workstreams = useWorkstreams(projectId);
  const members = useMembers(projectId);
  const aiFlows = useFlows(projectId);
  const customTypes = useCustomTypes(projectId);
  const commentCounts = useCommentCounts(projectId);

  const ready = tasks.ready
    && jobs.ready
    && workstreams.ready
    && members.ready
    && aiFlows.ready
    && customTypes.ready
    && commentCounts.ready;

  return {
    tasks,
    jobs,
    workstreams,
    members,
    aiFlows,
    customTypes,
    commentCounts,
    ready,
  };
}
