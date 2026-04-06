import { useMemo } from 'react';
import { WorkstreamColumn } from './WorkstreamColumn';
import type { JobView } from './job-types';
import s from './ArchivePage.module.css';

interface Workstream {
  id: string;
  name: string;
  description?: string;
  has_code?: boolean;
  status: string;
  position: number;
  pr_url?: string | null;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  auto_continue: boolean;
  assignee?: string | null;
  images?: string[];
  status?: string;
  priority?: string;
  workstream_id?: string | null;
  position?: number;
  flow_id?: string | null;
  chaining?: string;
}

type ArchiveColumnTask = Omit<Task, 'assignee' | 'workstream_id' | 'position' | 'chaining'> & {
  assignee: { type: string; name?: string; initials?: string } | null;
  workstream_id: string | null;
  position: number;
  chaining?: 'none' | 'produce' | 'accept' | 'both';
};

interface ArchivePageProps {
  workstreams: Workstream[];
  tasks: Task[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  projectId: string | null;
  onRestore: (workstreamId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
}

const emptySet = new Set<string>();
const noop = () => {};

function normalizeChaining(value?: string): 'none' | 'produce' | 'accept' | 'both' | undefined {
  return value === 'none' || value === 'produce' || value === 'accept' || value === 'both'
    ? value
    : undefined;
}

function mapArchiveTask(
  task: Task,
  memberMap: Record<string, { name: string; initials: string }>,
): ArchiveColumnTask {
  const member = task.assignee ? memberMap[task.assignee] : null;
  return {
    ...task,
    assignee: member
      ? { type: 'user', name: member.name, initials: member.initials }
      : task.assignee ? { type: 'ai' } : null,
    workstream_id: task.workstream_id ?? null,
    position: task.position ?? 0,
    chaining: normalizeChaining(task.chaining),
  };
}

export function ArchivePage({ workstreams, tasks, jobs, memberMap, projectId, onRestore, onUpdateTask }: ArchivePageProps) {
  const taskJobMap = useMemo(() => {
    const priority: Record<string, number> = { running: 0, queued: 1, paused: 2, review: 3, done: 4, failed: 5 };
    const map: Record<string, JobView> = {};
    for (const job of jobs) {
      const existing = map[job.taskId];
      if (!existing || (priority[job.status] ?? 5) < (priority[existing.status] ?? 5)) {
        map[job.taskId] = job;
      }
    }
    return map;
  }, [jobs]);

  const completedBacklogTasks = useMemo(() => {
    return tasks
      .filter(t => !t.workstream_id && t.status === 'done')
      .map(t => mapArchiveTask(t, memberMap))
      .sort((a, b) => a.position - b.position);
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
        <div className={s.columnWrap}>
          <WorkstreamColumn
            workstream={null}
            tasks={completedBacklogTasks}
            taskJobMap={taskJobMap}
            isBacklog
            canRunAi={false}
            projectId={projectId}
            mentionedTaskIds={emptySet}
            focusTaskId={null}
            draggedTaskId={null}
            onDragTaskStart={noop}
            onDragTaskEnd={noop}
            onDropTask={noop}
            onAddTask={noop}
            onUpdateTask={onUpdateTask}
          />
        </div>
      )}
      {workstreams.map(ws => {
        const wsTasks = tasks
          .filter(t => t.workstream_id === ws.id)
          .map(t => mapArchiveTask(t, memberMap))
          .sort((a, b) => a.position - b.position);

        return (
          <div key={ws.id} className={s.columnWrap}>
            <div className={s.restoreBar}>
              <button className={s.restoreBtn} onClick={() => onRestore(ws.id)}>Restore to board</button>
            </div>
            <WorkstreamColumn
              workstream={ws}
              tasks={wsTasks}
              taskJobMap={taskJobMap}
              isBacklog={false}
              canRunAi={false}
              projectId={projectId}
              mentionedTaskIds={emptySet}
              focusTaskId={null}
              draggedTaskId={null}
              onDragTaskStart={noop}
              onDragTaskEnd={noop}
              onDropTask={noop}
              onAddTask={noop}
            />
          </div>
        );
      })}
    </div>
  );
}
