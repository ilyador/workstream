import { useState, useRef, useMemo, useEffect } from 'react';
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
  flow_id?: string | null;
}

interface Workstream {
  id: string;
  name: string;
  description?: string;
  has_code?: boolean;
  status: string;
  position: number;
  pr_url?: string | null;
}

interface BoardProps {
  workstreams: Workstream[];
  tasks: Task[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap?: Record<string, string>;
  userRole: string;
  projectId: string | null;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
  // Workstream actions
  onCreateWorkstream: (name: string, description?: string, has_code?: boolean) => Promise<void>;
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
  flowMap,
  userRole,
  projectId,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
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
  const [draggedWsId, setDraggedWsId] = useState<string | null>(null);
  const [addingWs, setAddingWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [newWsHasCode, setNewWsHasCode] = useState(true);

  const boardRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up scroll interval on unmount
  useEffect(() => () => {
    if (scrollInterval.current) clearInterval(scrollInterval.current);
  }, []);

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
      const flowName = task.flow_id && flowMap ? flowMap[task.flow_id] : null;
      groups[key].push({
        ...task,
        assignee: member
          ? { type: 'user', name: member.name, initials: member.initials }
          : flowName
            ? { type: 'ai', name: flowName }
            : task.assignee
              ? { type: 'ai' }
              : null,
      });
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort((a: any, b: any) => a.position - b.position);
    }
    return groups;
  }, [tasks, workstreams, memberMap, flowMap]);

  const sortedWs = useMemo(
    () => [...workstreams].sort((a, b) => a.position - b.position),
    [workstreams]
  );

  const handleDropTask = async (targetWsId: string | null, dropBeforeTaskId: string | null) => {
    if (!draggedTaskId) return;
    const task = tasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    // Get tasks in the target column, excluding the dragged task
    const targetKey = targetWsId || '__backlog__';
    const targetTasks = (tasksByWorkstream[targetKey] || []).filter((t: any) => t.id !== draggedTaskId);
    let newPosition: number;

    if (!dropBeforeTaskId) {
      // Dropped at end
      const last = targetTasks[targetTasks.length - 1];
      newPosition = last ? last.position + 1 : 1;
    } else {
      const dropIdx = targetTasks.findIndex((t: any) => t.id === dropBeforeTaskId);
      if (dropIdx === 0) {
        // Dropped at start
        newPosition = targetTasks[0].position - 1;
      } else if (dropIdx > 0) {
        // Dropped between two items
        const before = targetTasks[dropIdx - 1];
        const after = targetTasks[dropIdx];
        newPosition = Math.floor((before.position + after.position) / 2);
        if (newPosition === before.position) newPosition = before.position + 1;
      } else {
        // dropBeforeTaskId not found — drop at end
        const last = targetTasks[targetTasks.length - 1];
        newPosition = last ? last.position + 1 : 1;
      }
    }

    await onMoveTask(draggedTaskId, targetWsId, newPosition);
    setDraggedTaskId(null);
  };

  const handleBoardDragOver = (e: React.DragEvent) => {
    const board = boardRef.current;
    if (!board || (!draggedTaskId && !draggedWsId)) return;

    const rect = board.getBoundingClientRect();
    const edgeZone = 80;
    const scrollSpeed = 12;

    if (e.clientX < rect.left + edgeZone) {
      if (!scrollInterval.current) {
        scrollInterval.current = setInterval(() => {
          board.scrollLeft -= scrollSpeed;
        }, 16);
      }
    } else if (e.clientX > rect.right - edgeZone) {
      if (!scrollInterval.current) {
        scrollInterval.current = setInterval(() => {
          board.scrollLeft += scrollSpeed;
        }, 16);
      }
    } else {
      if (scrollInterval.current) {
        clearInterval(scrollInterval.current);
        scrollInterval.current = null;
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDraggedWsId(null);
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };

  const handleColumnDrop = async (targetWsId: string) => {
    if (!draggedWsId || draggedWsId === targetWsId) return;
    const dragged = workstreams.find(w => w.id === draggedWsId);
    const target = workstreams.find(w => w.id === targetWsId);
    if (!dragged || !target) return;
    await onUpdateWorkstream(draggedWsId, { position: target.position });
    await onUpdateWorkstream(targetWsId, { position: dragged.position });
    setDraggedWsId(null);
  };

  const handleCreateWorkstream = async () => {
    const name = newWsName.trim();
    if (!name) return;
    await onCreateWorkstream(name, newWsDesc.trim() || undefined, newWsHasCode);
    setNewWsName('');
    setNewWsDesc('');
    setNewWsHasCode(true);
    setAddingWs(false);
  };

  return (
    <div
      className={`${s.board} ${(draggedTaskId || draggedWsId) ? s.boardDragging : ''}`}
      ref={boardRef}
      onDragOver={handleBoardDragOver}
    >
      {/* Backlog column */}
      <WorkstreamColumn
        workstream={null}
        tasks={tasksByWorkstream.__backlog__ || []}
        taskJobMap={taskJobMap}
        isBacklog
        canRunAi={userRole !== 'manager'}
        projectId={projectId}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        focusTaskId={focusTaskId}
        draggedTaskId={draggedTaskId}
        onDragTaskStart={setDraggedTaskId}
        onDragTaskEnd={handleDragEnd}
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
          mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
          focusTaskId={focusTaskId}
          draggedTaskId={draggedTaskId}
          draggedWsId={draggedWsId}
          onDragTaskStart={setDraggedTaskId}
          onDragTaskEnd={handleDragEnd}
          onDropTask={handleDropTask}
          onColumnDragStart={setDraggedWsId}
          onColumnDrop={handleColumnDrop}
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
          onArchive={async () => {
            try {
              await onUpdateWorkstream(ws.id, { status: 'archived' });
            } catch (err: any) {
              console.error('Archive failed:', err);
            }
          }}
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
              if (e.key === 'Escape') { setAddingWs(false); setNewWsName(''); setNewWsDesc(''); setNewWsHasCode(true); }
            }}
            placeholder="Workstream name..."
            autoFocus
          />
          <input
            className={s.addInput}
            value={newWsDesc}
            onChange={(e) => setNewWsDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateWorkstream();
              if (e.key === 'Escape') { setAddingWs(false); setNewWsName(''); setNewWsDesc(''); setNewWsHasCode(true); }
            }}
            placeholder="Goal (optional, max 100 chars)"
            maxLength={100}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={newWsHasCode} onChange={e => setNewWsHasCode(e.target.checked)} />
            Code (PR flow on completion)
          </label>
          <button className="btn btnPrimary btnSm" onClick={handleCreateWorkstream}>Add</button>
          <button className="btn btnGhost btnSm" onClick={() => { setAddingWs(false); setNewWsName(''); setNewWsDesc(''); setNewWsHasCode(true); }}>
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
