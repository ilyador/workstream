import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TaskView } from '../lib/task-view';
import type { TaskCardMetaItem } from './task-card-types';
import s from './TaskCard.module.css';

interface TaskFlowStepDetailProps {
  task: TaskView;
  metaItems?: TaskCardMetaItem[];
  onEdit?: () => void;
  onDelete?: () => void;
}

export function TaskFlowStepDetail({
  task,
  metaItems,
  onEdit,
  onDelete,
}: TaskFlowStepDetailProps) {
  return (
    <>
      {task.description && <div className={s.desc}><Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown></div>}
      {metaItems && metaItems.length > 0 && (
        <div className={s.meta}>
          {metaItems.map(item => <span key={item.label}>{item.label}: {item.value}</span>)}
        </div>
      )}
      {(onEdit || onDelete) && (
        <div className={s.actions}>
          <div className={s.actionsLeft}>
            {onEdit && (
              <button className="btn btnGhost btnSm" onClick={onEdit}>Edit</button>
            )}
            {onDelete && (
              <button className="btn btnGhost btnSm" onClick={onDelete}>Delete</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
