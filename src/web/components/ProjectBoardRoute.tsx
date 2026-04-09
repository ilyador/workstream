import { Board } from './Board';
import type { ProjectWorkspaceRoutesProps } from './ProjectWorkspaceRoutes';

type ProjectBoardRouteProps = Pick<
  ProjectWorkspaceRoutesProps,
  | 'project'
  | 'tasks'
  | 'jobs'
  | 'activeWorkstreams'
  | 'memberMap'
  | 'flowMap'
  | 'mentionedTaskIds'
  | 'commentCounts'
  | 'focusTaskId'
  | 'focusWsId'
  | 'userId'
  | 'onCreateWorkstream'
  | 'onUpdateWorkstream'
  | 'onDeleteWorkstream'
  | 'onSwapColumns'
  | 'onAddTask'
  | 'onRunWorkstream'
  | 'onRunTask'
  | 'onEditTask'
  | 'onDeleteTask'
  | 'onUpdateTask'
  | 'onMoveTask'
  | 'onTerminate'
  | 'onReply'
  | 'onApprove'
  | 'onReject'
  | 'onRework'
  | 'onDeleteJob'
  | 'onMoveToBacklog'
  | 'onContinue'
  | 'onCreatePr'
>;

export function ProjectBoardRoute({
  project,
  tasks,
  jobs,
  activeWorkstreams,
  memberMap,
  flowMap,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  userId,
  onCreateWorkstream,
  onUpdateWorkstream,
  onDeleteWorkstream,
  onSwapColumns,
  onAddTask,
  onRunWorkstream,
  onRunTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onMoveTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onCreatePr,
}: ProjectBoardRouteProps) {
  return (
    <Board
      workstreams={activeWorkstreams}
      tasks={tasks}
      jobs={jobs}
      memberMap={memberMap}
      flowMap={flowMap}
      userRole={project.role || 'dev'}
      projectId={project.id}
      mentionedTaskIds={mentionedTaskIds}
      commentCounts={commentCounts}
      focusTaskId={focusTaskId}
      focusWsId={focusWsId}
      currentUserId={userId}
      onCreateWorkstream={onCreateWorkstream}
      onUpdateWorkstream={onUpdateWorkstream}
      onDeleteWorkstream={onDeleteWorkstream}
      onSwapColumns={onSwapColumns}
      onAddTask={onAddTask}
      onRunWorkstream={onRunWorkstream}
      onRunTask={onRunTask}
      onEditTask={(task) => onEditTask(task.id)}
      onDeleteTask={onDeleteTask}
      onUpdateTask={onUpdateTask}
      onMoveTask={onMoveTask}
      onTerminate={onTerminate}
      onReply={onReply}
      onApprove={onApprove}
      onReject={onReject}
      onRework={onRework}
      onDeleteJob={onDeleteJob}
      onMoveToBacklog={onMoveToBacklog}
      onContinue={onContinue}
      onCreatePr={onCreatePr}
    />
  );
}
