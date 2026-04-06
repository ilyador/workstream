import type React from 'react';
import type { WorkstreamView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

interface WorkstreamColumnHeaderProps {
  workstream: WorkstreamView | null;
  isBacklog: boolean;
  editing: boolean;
  editName: string;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  onEditNameChange: (value: string) => void;
  onRename: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onColumnDragStart?: (wsId: string) => void;
  canRunAi: boolean;
  onRunWorkstream?: () => void;
  wsStatus: string | null;
  totalTasks: number;
  doneTasks: number;
  hasBrokenLinks: boolean;
  headerExtra?: React.ReactNode;
  onAddTask: () => void;
  onRequestDelete?: () => void;
  progressPct: number;
}

export function WorkstreamColumnHeader({
  workstream,
  isBacklog,
  editing,
  editName,
  nameInputRef,
  onEditNameChange,
  onRename,
  onCancelEdit,
  onStartEdit,
  onColumnDragStart,
  canRunAi,
  onRunWorkstream,
  wsStatus,
  totalTasks,
  doneTasks,
  hasBrokenLinks,
  headerExtra,
  onAddTask,
  onRequestDelete,
  progressPct,
}: WorkstreamColumnHeaderProps) {
  return (
    <div className={s.headerWrap}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          {editing && !isBacklog ? (
            <input
              ref={nameInputRef}
              className={s.nameInput}
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onBlur={onRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
          ) : (
            <span
              className={`${s.name} ${!isBacklog && onColumnDragStart ? s.nameDraggable : ''}`}
              draggable={!isBacklog && !!onColumnDragStart && !!workstream}
              onDragStart={(e) => {
                if (isBacklog || !workstream || !onColumnDragStart) return;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', workstream.id);
                const ghost = document.createElement('div');
                ghost.textContent = workstream.name;
                ghost.style.cssText = `
                  padding: 8px 16px;
                  background: var(--white, #fff);
                  color: var(--text, #1a1a1a);
                  font-family: 'Instrument Sans', system-ui, sans-serif;
                  font-size: 13px;
                  font-weight: 600;
                  border-radius: 8px;
                  border: 1.5px solid rgba(37, 99, 235, 0.3);
                  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
                  position: fixed; top: -999px; left: -999px;
                  pointer-events: none;
                  white-space: nowrap;
                `;
                ghost.id = '__column-drag-preview__';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
                onColumnDragStart(workstream.id);
                e.stopPropagation();
              }}
              onDragEnd={() => {
                document.getElementById('__column-drag-preview__')?.remove();
              }}
              onDoubleClick={() => {
                if (!isBacklog && workstream) onStartEdit();
              }}
              title={isBacklog ? undefined : 'Drag to reorder, double-click to rename'}
            >
              {isBacklog ? 'Backlog' : workstream?.name}
            </span>
          )}

          {!isBacklog && totalTasks > 0 && wsStatus && wsStatus !== 'open' && (
            <span className={`${s.statusPill} ${s[`statusPill--${wsStatus.replace(' ', '-')}`] || ''}`}>
              {wsStatus}
            </span>
          )}

          {headerExtra}
        </div>

        <div className={s.headerRight}>
          {!isBacklog && canRunAi && onRunWorkstream && wsStatus === 'open' && totalTasks > 0 && !hasBrokenLinks && (
            <button
              className={s.runBtn}
              onClick={onRunWorkstream}
              title="Run workstream"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Run
            </button>
          )}

          <button
            className={s.addBtn}
            onClick={onAddTask}
            title="Add task"
          >
            +
          </button>

          {!headerExtra && totalTasks > 0 && (
            <span className={s.taskCount}>
              {isBacklog ? totalTasks : `${doneTasks}/${totalTasks}`}
            </span>
          )}

          {!isBacklog && (wsStatus === 'open' || !wsStatus) && workstream && onRequestDelete && (
            <button
              className={`${s.actionBtn} ${s.actionBtnDanger}`}
              onClick={onRequestDelete}
              title="Delete workstream"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {!headerExtra && !isBacklog && totalTasks > 0 && (
        <div className={s.progressLine}>
          <div
            className={`${s.progressLineFill} ${wsStatus ? s[`progressLine--${wsStatus.replace(' ', '-')}`] : ''}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
