import { ArchivePage } from './ArchivePage';
import type { ProjectWorkspaceRoutesProps } from './ProjectWorkspaceRoutes';

type ProjectArchiveRouteProps = Pick<
  ProjectWorkspaceRoutesProps,
  'allWorkstreams' | 'tasks' | 'jobs' | 'memberMap' | 'project' | 'focusTaskId' | 'onRestoreArchiveWorkstream' | 'onUpdateTask'
>;

export function ProjectArchiveRoute({
  allWorkstreams,
  tasks,
  jobs,
  memberMap,
  project,
  focusTaskId,
  onRestoreArchiveWorkstream,
  onUpdateTask,
}: ProjectArchiveRouteProps) {
  return (
    <ArchivePage
      workstreams={allWorkstreams.filter(workstream => workstream.status === 'archived')}
      tasks={tasks}
      jobs={jobs}
      memberMap={memberMap}
      projectId={project.id}
      focusTaskId={focusTaskId}
      onRestore={onRestoreArchiveWorkstream}
      onUpdateTask={onUpdateTask}
    />
  );
}
