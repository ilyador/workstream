import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TaskView } from '../lib/task-view';
import s from './TaskCard.module.css';

interface TaskCardPreviewProps {
  task: TaskView;
}

export function TaskCardPreview({ task }: TaskCardPreviewProps) {
  if (!task.description) return null;

  return (
    <div className={s.preview}>
      <div className={s.previewDesc}>
        <Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown>
      </div>
    </div>
  );
}
