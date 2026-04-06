import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WorkstreamTaskCardProps } from './WorkstreamColumn';
import s from './FlowStepCard.module.css';

type FlowStepCardProps = Pick<
  WorkstreamTaskCardProps,
  | 'task'
  | 'isExpanded'
  | 'onToggleExpand'
  | 'onEdit'
  | 'onDelete'
  | 'onDragStart'
  | 'onDragEnd'
  | 'isDragging'
  | 'dragDisabled'
  | 'metaItems'
>;

export function FlowStepCard({
  task,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  isDragging,
  dragDisabled,
  metaItems,
}: FlowStepCardProps) {
  return (
    <div
      className={`${s.card} ${isDragging ? s.dragging : ''}`}
      onClick={onToggleExpand}
    >
      <div className={s.compact}>
        {!dragDisabled && (
          <span
            className={s.handle}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              onDragStart?.(e);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              onDragEnd?.();
            }}
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
          >
            &#8942;&#8942;
          </span>
        )}

        <div className={s.header}>
          <span className={s.title}>{task.title}</span>
          <span className={s.modelTag}>{task.type}</span>
        </div>
      </div>

      {isExpanded && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {task.description && (
            <div className={s.desc}>
              <Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown>
            </div>
          )}

          {metaItems && metaItems.length > 0 && (
            <div className={s.meta}>
              {metaItems.map((item) => (
                <span key={item.label} className={s.metaItem}>
                  <span className={s.metaLabel}>{item.label}</span>
                  <span className={s.metaValue}>{item.value}</span>
                </span>
              ))}
            </div>
          )}

          {(onEdit || onDelete) && (
            <div className={s.actions}>
              {onEdit && (
                <button className="btn btnGhost btnSm" onClick={onEdit}>
                  Edit
                </button>
              )}
              {onDelete && (
                <button className="btn btnGhost btnSm" onClick={onDelete}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
