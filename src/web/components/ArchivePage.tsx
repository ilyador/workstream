import s from './ArchivePage.module.css';

interface Workstream {
  id: string;
  name: string;
  status: string;
  pr_url?: string | null;
}

interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  workstream_id: string | null;
}

interface ArchivePageProps {
  workstreams: Workstream[];
  tasks: Task[];
  onRestore: (workstreamId: string) => void;
}

export function ArchivePage({ workstreams, tasks, onRestore }: ArchivePageProps) {
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
        const wsTasks = tasks.filter(t => t.workstream_id === ws.id)
          .sort((a, b) => (a as any).position - (b as any).position);
        return (
          <div key={ws.id} className={s.column}>
            <div className={s.header}>
              <span className={s.name}>{ws.name}</span>
              <div className={s.headerActions}>
                {ws.pr_url && (
                  <a href={ws.pr_url} target="_blank" rel="noopener noreferrer" className={s.prBtn}>
                    View PR
                  </a>
                )}
                <button className={s.restoreBtn} onClick={() => onRestore(ws.id)}>
                  Restore
                </button>
              </div>
            </div>
            <div className={s.taskList}>
              {wsTasks.map(t => (
                <div key={t.id} className={s.task}>
                  <span className={s.taskTitle}>{t.title}</span>
                  <span className={s.taskType}>{t.type}</span>
                </div>
              ))}
              {wsTasks.length === 0 && (
                <div className={s.taskEmpty}>No tasks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
