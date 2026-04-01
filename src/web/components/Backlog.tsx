import { useState } from 'react';
import s from './Backlog.module.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  blocked: boolean;
  blockedBy?: string;
  blockedByTitles?: string[];
  assignee: { type: string; name?: string; initials?: string };
  images?: string[];
}

export function Backlog({ tasks, onAddTask }: { tasks: Task[]; onAddTask?: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section>
      <div className={s.header}>
        <span className={s.label}>Backlog</span>
        <span className={s.count}>{tasks.length}</span>
      </div>
      <div className={s.list}>
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`${s.item} ${task.blocked ? s.blockedItem : ''} ${expanded === task.id ? s.expanded : ''}`}
            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
          >
            <div className={s.row}>
              <span className={s.handle}>&#8942;</span>
              <span className={s.title}>{task.title}</span>
              {task.blocked && <span className={s.tag + ' ' + s.tagRed}>blocked</span>}
              {task.mode === 'human' && <span className={s.tag + ' ' + s.tagGray}>human</span>}
              <span className={s.tag + ' ' + s.tagLight}>{task.type}</span>
            </div>
            {expanded === task.id && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                {task.description && <p className={s.desc}>{task.description}</p>}
                <div className={s.detailMeta}>
                  <span>effort: {task.effort}</span>
                  <span>mode: {task.mode}</span>
                  {task.multiagent && <span>multiagent: {task.multiagent}</span>}
                  <span>assignee: {task.assignee.type === 'ai' ? 'AI' : (task.assignee.name || task.assignee.initials)}</span>
                </div>
                {task.blockedByTitles && task.blockedByTitles.length > 0 && (
                  <div className={s.detailBlockers}>
                    <span className={s.detailBlockersLabel}>blocked by:</span>
                    {task.blockedByTitles.map((title, i) => (
                      <span key={i} className={s.detailBlockerTag}>{title}</span>
                    ))}
                  </div>
                )}
                {task.images && task.images.length > 0 && (
                  <div className={s.detailImages}>
                    {task.images.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={s.detailImageLink}>
                        <img src={url} alt={`Attachment ${i + 1}`} className={s.detailImageThumb} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div className={s.addRow} onClick={onAddTask}>+ Add task</div>
      </div>
    </section>
  );
}
