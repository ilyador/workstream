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
  assignee?: { type: string; name?: string; initials?: string } | null;
  images?: string[];
  status?: string;
  priority?: string;
}

interface ArchivePageProps {
  workstreams: Workstream[];
  tasks: Task[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  projectId: string | null;
  onRestore: (workstreamId: string) => void;
}

const emptySet = new Set<string>();
const noop = () => {};

export function ArchivePage({ workstreams, tasks, jobs, memberMap, projectId, onRestore }: ArchivePageProps) {
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

  if (workstreams.length === 0) {
    return (
      <div className={s.empty}>
        <span>No archived workstreams</span>
      </div>
    );
  }

  return (
    <div className={s.archive}>
      {workstreams.map(ws => {
        const wsTasks = tasks
          .filter(t => (t as any).workstream_id === ws.id)
          .map(t => {
            const member = (t as any).assignee ? memberMap[(t as any).assignee] : null;
            return {
              ...t,
              assignee: member
                ? { type: 'user', name: member.name, initials: member.initials }
                : (t as any).assignee ? { type: 'ai' } : null,
            };
          })
          .sort((a, b) => ((a as any).position || 0) - ((b as any).position || 0));

        return (
          <div key={ws.id} className={s.columnWrap}>
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
              onArchive={() => onRestore(ws.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
