import { useMemo } from 'react';
import { WorkstreamColumn } from './WorkstreamColumn';
import type { JobView } from './job-types';
import type { TaskRecord } from '../lib/api';
import { compareByPosition, toTaskView, type TaskView, type WorkstreamView } from '../lib/task-view';
import { mapPrimaryJobsByTask } from '../lib/job-selection';
import s from './ArchivePage.module.css';

interface ArchivePageProps {
  workstreams: WorkstreamView[];
  tasks: TaskRecord[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  projectId: string | null;
  onRestore: (workstreamId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
}

const emptySet = new Set<string>();
const noop = () => {};

function mapArchiveTask(
  task: TaskRecord,
  memberMap: Record<string, { name: string; initials: string }>,
): TaskView {
  return toTaskView(task, memberMap);
}

export function ArchivePage({ workstreams, tasks, jobs, memberMap, projectId, onRestore, onUpdateTask }: ArchivePageProps) {
  const members = useMemo(
    () => Object.entries(memberMap).map(([id, m]) => ({ id, name: m.name, initials: m.initials })),
    [memberMap],
  );

  const taskJobMap = useMemo(() => {
    return mapPrimaryJobsByTask(jobs);
  }, [jobs]);

  const completedBacklogTasks = useMemo(() => {
    return tasks
      .filter(t => !t.workstream_id && t.status === 'done')
      .map(t => mapArchiveTask(t, memberMap))
      .sort(compareByPosition);
  }, [tasks, memberMap]);

  if (workstreams.length === 0 && completedBacklogTasks.length === 0) {
    return (
      <div className={s.empty}>
        <span>No archived workstreams</span>
      </div>
    );
  }

  return (
    <div className={s.archive}>
      {completedBacklogTasks.length > 0 && (
        <WorkstreamColumn
          workstream={null}
          tasks={completedBacklogTasks}
          taskJobMap={taskJobMap}
          isBacklog
          canRunAi={false}
          projectId={projectId}
          members={members}
          mentionedTaskIds={emptySet}
          focusTaskId={null}
          draggedTaskId={null}
          onDragTaskStart={noop}
          onDragTaskEnd={noop}
          onDropTask={noop}
          onAddTask={noop}
          onUpdateTask={onUpdateTask}
        />
      )}
      {workstreams.map(ws => {
        const wsTasks = tasks
          .filter(t => t.workstream_id === ws.id)
          .map(t => mapArchiveTask(t, memberMap))
          .sort(compareByPosition);

        return (
          <WorkstreamColumn
            key={ws.id}
            workstream={ws}
            tasks={wsTasks}
            taskJobMap={taskJobMap}
            isBacklog={false}
            canRunAi={false}
            projectId={projectId}
            members={members}
            mentionedTaskIds={emptySet}
            focusTaskId={null}
            draggedTaskId={null}
            onDragTaskStart={noop}
            onDragTaskEnd={noop}
            onDropTask={noop}
            onAddTask={noop}
            listHeader={(
              <div className={s.restoreBar}>
                <button className={s.restoreBtn} onClick={() => onRestore(ws.id)}>Restore to board</button>
              </div>
            )}
          />
        );
      })}
    </div>
  );
}
