import { useState, useMemo } from 'react';
import { WorkstreamColumn } from './WorkstreamColumn';
import { useBoardDrag } from '../hooks/useBoardDrag';
import type { JobView } from './job-types';
import type { TaskRecord } from '../lib/api';
import { compareByPosition, toTaskView, type TaskView, type WorkstreamView } from '../lib/task-view';
import { mapPrimaryJobsByTask } from '../lib/job-selection';
import s from './Board.module.css';

interface BoardProps {
  workstreams: WorkstreamView[];
  tasks: TaskRecord[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
  typeFlowMap: Record<string, string>;
  userRole: string;
  projectId: string | null;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
  focusWsId?: string | null;
  // Workstream actions
  onCreateWorkstream: (name: string, description?: string, has_code?: boolean) => Promise<void>;
  onUpdateWorkstream: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteWorkstream: (id: string) => Promise<void>;
  onSwapColumns: (draggedId: string, targetId: string) => void;
  // Task actions
  onAddTask: (workstreamId: string | null) => void;
  onRunTask: (taskId: string) => void;
  onRunWorkstream: (workstreamId: string) => void;
  onEditTask: (task: TaskView) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onMoveTask: (taskId: string, workstreamId: string | null, newPosition: number) => void;
  // Job actions
  onTerminate: (jobId: string) => void;
  onReply: (jobId: string, answer: string) => void;
  onApprove: (jobId: string) => void;
  onReject: (jobId: string) => void;
  onRework: (jobId: string, note: string) => void;
  onDeleteJob: (jobId: string) => void;
  onMoveToBacklog: (jobId: string) => void;
  onContinue: (jobId: string) => void;
  onCreatePr: (workstreamId: string, options?: { review?: boolean }) => void;
  currentUserId?: string;
}

export function Board({
  workstreams,
  tasks,
  jobs,
  memberMap,
  flowMap,
  typeFlowMap,
  userRole,
  projectId,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  onCreateWorkstream,
  onUpdateWorkstream,
  onDeleteWorkstream,
  onSwapColumns,
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
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onCreatePr,
  currentUserId,
}: BoardProps) {
  const {
    boardRef,
    draggedTaskId,
    setDraggedTaskId,
    draggedGroupIds,
    draggedWsId,
    setDraggedWsId,
    handleDragGroupStart,
    handleColumnDrop,
    handleDragEnd,
    handleBoardDragOver,
    isDragging,
  } = useBoardDrag({ onSwapColumns });

  const [addingWs, setAddingWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [newWsHasCode, setNewWsHasCode] = useState(true);

  const taskJobMap = useMemo(() => {
    return mapPrimaryJobsByTask(jobs);
  }, [jobs]);

  const tasksByWorkstream = useMemo(() => {
    const groups: Record<string, TaskView[]> = { __backlog__: [] };
    for (const ws of workstreams) groups[ws.id] = [];

    for (const task of tasks) {
      const key = task.workstream_id || '__backlog__';
      // Done/canceled backlog tasks belong in the archive, not the live board
      if (key === '__backlog__' && (task.status === 'done' || task.status === 'canceled')) continue;
      if (!groups[key]) groups[key] = [];
      const resolvedFlowId = task.flow_id || typeFlowMap[task.type];
      const flowName = resolvedFlowId ? flowMap[resolvedFlowId] : null;
      groups[key].push(toTaskView(task, memberMap, flowName));
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort(compareByPosition);
    }
    return groups;
  }, [tasks, workstreams, memberMap, flowMap, typeFlowMap]);

  const sortedWs = useMemo(
    () => [...workstreams].sort((a, b) => a.position - b.position),
    [workstreams]
  );

  const members = useMemo(
    () => Object.entries(memberMap).map(([id, m]) => ({ id, name: m.name, initials: m.initials })),
    [memberMap]
  );

  const handleDropTask = (targetWsId: string | null, dropBeforeTaskId: string | null) => {
    if (!draggedTaskId) return;

    const idsToMove = draggedGroupIds.length > 0 ? draggedGroupIds : [draggedTaskId];

    // Get tasks in the target column, excluding all tasks being moved
    const targetKey = targetWsId || '__backlog__';
    const idsSet = new Set(idsToMove);
    const targetTasks = (tasksByWorkstream[targetKey] || []).filter(t => !idsSet.has(t.id));

    // Prevent dropping above the freeze line (last touched task)
    const untouched = new Set(['backlog', 'todo']);
    let freezeIdx = -1;
    for (let i = 0; i < targetTasks.length; i++) {
      if (!untouched.has(targetTasks[i].status || 'backlog')) freezeIdx = i;
    }
    if (dropBeforeTaskId && freezeIdx >= 0) {
      const dropIdx = targetTasks.findIndex(t => t.id === dropBeforeTaskId);
      if (dropIdx >= 0 && dropIdx <= freezeIdx) return; // Can't drop into the frozen zone
    }

    let basePosition: number;

    if (!dropBeforeTaskId) {
      // Dropped at end
      const last = targetTasks[targetTasks.length - 1];
      basePosition = last ? (last.position ?? 0) + 1 : 1;
    } else {
      const dropIdx = targetTasks.findIndex(t => t.id === dropBeforeTaskId);
      if (dropIdx === 0) {
        // Dropped at start
        basePosition = (targetTasks[0]?.position ?? idsToMove.length) - idsToMove.length;
      } else if (dropIdx > 0) {
        // Dropped between two items — ensure all group members fit in the gap
        const before = targetTasks[dropIdx - 1];
        const after = targetTasks[dropIdx];
        const gap = (after?.position ?? 0) - (before?.position ?? 0);
        const spacing = gap / (idsToMove.length + 1);
        basePosition = (before?.position ?? 0) + spacing;
      } else {
        // dropBeforeTaskId not found -- drop at end
        const last = targetTasks[targetTasks.length - 1];
        basePosition = last ? (last.position ?? 0) + 1 : 1;
      }
    }

    // Move all tasks in the group
    const step = idsToMove.length > 1 ? 0.001 : 0;
    for (let i = 0; i < idsToMove.length; i++) {
      onMoveTask(idsToMove[i], targetWsId, basePosition + i * step);
    }

    setDraggedTaskId(null);
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
      className={`${s.board} ${isDragging ? s.boardDragging : ''}`}
      ref={boardRef}
      onDragOver={handleBoardDragOver}
      data-board
    >
      {/* Backlog column */}
      <WorkstreamColumn
        workstream={null}
        tasks={tasksByWorkstream.__backlog__ || []}
        taskJobMap={taskJobMap}
        isBacklog
        canRunAi={userRole !== 'manager'}
        projectId={projectId}
        members={members}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        focusTaskId={focusTaskId}
        draggedTaskId={draggedTaskId}
        draggedGroupIds={draggedGroupIds}
        onDragTaskStart={setDraggedTaskId}
        onDragGroupStart={handleDragGroupStart}
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
        onRework={onRework}
        onDeleteJob={onDeleteJob}
        onMoveToBacklog={onMoveToBacklog}
          onContinue={onContinue}
          currentUserId={currentUserId}
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
          members={members}
          mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
          focusTaskId={focusTaskId}
          focusWsId={focusWsId}
          draggedTaskId={draggedTaskId}
          draggedGroupIds={draggedGroupIds}
          draggedWsId={draggedWsId}
          onDragTaskStart={setDraggedTaskId}
          onDragGroupStart={handleDragGroupStart}
          onDragTaskEnd={handleDragEnd}
          onDropTask={handleDropTask}
          onColumnDragStart={setDraggedWsId}
          onColumnDrop={handleColumnDrop}
          onRenameWorkstream={(id, name) => onUpdateWorkstream(id, { name })}
          onDeleteWorkstream={onDeleteWorkstream}
          onUpdateWorkstream={onUpdateWorkstream}
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
          onRework={onRework}
          onDeleteJob={onDeleteJob}
          onMoveToBacklog={onMoveToBacklog}
          onContinue={onContinue}
          currentUserId={currentUserId}
          onCreatePr={(opts) => onCreatePr(ws.id, opts)}
          onArchive={async () => {
            try {
              await onUpdateWorkstream(ws.id, { status: 'archived' });
            } catch (err) {
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
          <label className={s.addCheckboxLabel}>
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
