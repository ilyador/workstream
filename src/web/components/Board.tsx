import { useState, useMemo } from 'react';
import { WorkstreamColumn } from './WorkstreamColumn';
import type { JobView } from './job-types';
import s from './Board.module.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  auto_continue: boolean;
  workstream_id: string | null;
  position: number;
  assignee?: string | null;
  images?: string[];
  status?: string;
  priority?: string;
}

interface Workstream {
  id: string;
  name: string;
  status: string;
  position: number;
}

interface BoardProps {
  workstreams: Workstream[];
  tasks: Task[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  userRole: string;
  projectId: string | null;
  // Workstream actions
  onCreateWorkstream: (name: string) => Promise<void>;
  onUpdateWorkstream: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteWorkstream: (id: string) => Promise<void>;
  // Task actions
  onAddTask: (workstreamId: string | null) => void;
  onRunTask: (taskId: string) => void;
  onRunWorkstream: (workstreamId: string) => void;
  onEditTask: (task: any) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onMoveTask: (taskId: string, workstreamId: string | null, newPosition: number) => Promise<void>;
  // Job actions
  onTerminate: (jobId: string) => void;
  onReply: (jobId: string, answer: string) => void;
  onApprove: (jobId: string) => void;
  onReject: (jobId: string) => void;
  onRevert: (jobId: string) => void;
  onDeleteJob: (jobId: string) => void;
  onCreatePr: (workstreamId: string) => void;
}

export function Board({
  workstreams,
  tasks,
  jobs,
  memberMap,
  userRole,
  projectId,
  onCreateWorkstream,
  onUpdateWorkstream,
  onDeleteWorkstream,
  onAddTask,
  onRunTask,
  onRunWorkstream,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onMoveTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRevert,
  onDeleteJob,
  onCreatePr,
}: BoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [addingWs, setAddingWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');

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

  const tasksByWorkstream = useMemo(() => {
    const groups: Record<string, any[]> = { __backlog__: [] };
    for (const ws of workstreams) groups[ws.id] = [];

    for (const task of tasks) {
      const key = task.workstream_id || '__backlog__';
      if (!groups[key]) groups[key] = [];
      const member = task.assignee ? memberMap[task.assignee] : null;
      groups[key].push({
        ...task,
        assignee: member
          ? { type: 'user', name: member.name, initials: member.initials }
          : task.assignee
            ? { type: 'ai' }
            : null,
      });
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort((a: any, b: any) => a.position - b.position);
    }
    return groups;
  }, [tasks, workstreams, memberMap]);

  const sortedWs = useMemo(
    () => [...workstreams].sort((a, b) => a.position - b.position),
    [workstreams]
  );

  const handleDropTask = async (targetWsId: string | null, dropIndex: number) => {
    if (!draggedTaskId) return;
    const task = tasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    // Calculate new position based on drop index
    const targetKey = targetWsId || '__backlog__';
    const targetTasks = tasksByWorkstream[targetKey] || [];
    let newPosition: number;

    if (dropIndex >= targetTasks.length) {
      // Dropped at end
      const last = targetTasks[targetTasks.length - 1];
      newPosition = last ? last.position + 1 : 1;
    } else if (dropIndex === 0) {
      // Dropped at start
      const first = targetTasks[0];
      newPosition = first ? first.position - 1 : 1;
    } else {
      // Dropped between two items
      const before = targetTasks[dropIndex - 1];
      const after = targetTasks[dropIndex];
      newPosition = Math.floor((before.position + after.position) / 2);
      if (newPosition === before.position) newPosition = before.position + 1;
    }

    await onMoveTask(draggedTaskId, targetWsId, newPosition);
    setDraggedTaskId(null);
  };

  const handleCreateWorkstream = async () => {
    const name = newWsName.trim();
    if (!name) return;
    await onCreateWorkstream(name);
    setNewWsName('');
    setAddingWs(false);
  };

  return (
    <div className={s.board}>
      {/* Backlog column */}
      <WorkstreamColumn
        workstream={null}
        tasks={tasksByWorkstream.__backlog__ || []}
        taskJobMap={taskJobMap}
        isBacklog
        canRunAi={userRole !== 'manager'}
        projectId={projectId}
        draggedTaskId={draggedTaskId}
        onDragTaskStart={setDraggedTaskId}
        onDragTaskEnd={() => setDraggedTaskId(null)}
        onDropTask={handleDropTask}
        onAddTask={() => onAddTask(null)}
        onRunTask={onRunTask}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        onTerminate={onTerminate}
        onReply={onReply}
        onApprove={onApprove}
        onReject={onReject}
        onRevert={onRevert}
        onDeleteJob={onDeleteJob}
      />

      {/* Workstream columns */}
      {sortedWs.map(ws => (
        <WorkstreamColumn
          key={ws.id}
          workstream={ws}
          tasks={tasksByWorkstream[ws.id] || []}
          taskJobMap={taskJobMap}
          isBacklog={false}
          canRunAi={userRole !== 'manager'}
          projectId={projectId}
          draggedTaskId={draggedTaskId}
          onDragTaskStart={setDraggedTaskId}
          onDragTaskEnd={() => setDraggedTaskId(null)}
          onDropTask={handleDropTask}
          onRenameWorkstream={(id, name) => onUpdateWorkstream(id, { name })}
          onDeleteWorkstream={onDeleteWorkstream}
          onAddTask={() => onAddTask(ws.id)}
          onRunWorkstream={() => onRunWorkstream(ws.id)}
          onRunTask={onRunTask}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
          onUpdateTask={onUpdateTask}
          onTerminate={onTerminate}
          onReply={onReply}
          onApprove={onApprove}
          onReject={onReject}
          onRevert={onRevert}
          onDeleteJob={onDeleteJob}
          onCreatePr={() => onCreatePr(ws.id)}
        />
      ))}

      {/* Add workstream */}
      {addingWs ? (
        <div className={s.addForm}>
          <input
            className={s.addInput}
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateWorkstream();
              if (e.key === 'Escape') { setAddingWs(false); setNewWsName(''); }
            }}
            placeholder="Workstream name..."
            autoFocus
          />
          <button className="btn btnPrimary btnSm" onClick={handleCreateWorkstream}>Add</button>
          <button className="btn btnGhost btnSm" onClick={() => { setAddingWs(false); setNewWsName(''); }}>
            Cancel
          </button>
        </div>
      ) : (
        <button className={s.addColumn} onClick={() => setAddingWs(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add workstream
        </button>
      )}
    </div>
  );
}
