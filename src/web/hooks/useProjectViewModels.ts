import { useMemo } from 'react';
import type { Flow, MemberRecord, NotificationRecord, TaskRecord, WorkstreamRecord } from '../lib/api';
import type { JobRecord, JobView } from '../components/job-types';
import {
  buildFlowMap,
  buildJobViews,
  buildMemberMap,
  buildMentionedTaskIds,
  buildPrimaryJobViews,
  buildReviewItems,
  buildTaskTitleMap,
  buildTaskTypeMap,
  buildTodoItems,
  buildTypeFlowMap,
  buildWorkstreamNameMap,
} from '../lib/project-view-models';

interface UseProjectViewModelsArgs {
  tasks: TaskRecord[];
  jobs: JobRecord[];
  workstreams: WorkstreamRecord[];
  members: MemberRecord[];
  flows: Flow[];
  notifications: NotificationRecord[];
  currentUserId?: string | null;
}

export function useProjectViewModels({
  tasks,
  jobs,
  workstreams,
  members,
  flows,
  notifications,
  currentUserId,
}: UseProjectViewModelsArgs) {
  const mentionedTaskIds = useMemo(() => buildMentionedTaskIds(notifications), [notifications]);
  const taskTitleMap = useMemo(() => buildTaskTitleMap(tasks), [tasks]);
  const taskTypeMap = useMemo(() => buildTaskTypeMap(tasks), [tasks]);
  const memberMap = useMemo(() => buildMemberMap(members), [members]);
  const flowMap = useMemo(() => buildFlowMap(flows), [flows]);
  const typeFlowMap = useMemo(() => buildTypeFlowMap(flows), [flows]);
  const jobViews: JobView[] = useMemo(() => buildJobViews(jobs, taskTitleMap, taskTypeMap), [jobs, taskTitleMap, taskTypeMap]);
  const primaryJobViews = useMemo(() => buildPrimaryJobViews(jobViews), [jobViews]);
  const wsNameMap = useMemo(() => buildWorkstreamNameMap(workstreams), [workstreams]);
  const todoItems = useMemo(() => buildTodoItems(tasks, wsNameMap, currentUserId), [tasks, wsNameMap, currentUserId]);
  const reviewItems = useMemo(
    () => buildReviewItems(workstreams, primaryJobViews, tasks, wsNameMap, currentUserId),
    [currentUserId, workstreams, primaryJobViews, tasks, wsNameMap],
  );
  return {
    mentionedTaskIds,
    taskTitleMap,
    memberMap,
    flowMap,
    typeFlowMap,
    jobViews,
    primaryJobViews,
    todoItems,
    reviewItems,
  };
}
