import { capTaskCardToken } from './task-card-status';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import s from './TaskCard.module.css';

interface TaskCardFailedDetailProps {
  task: TaskView;
  job: JobView;
  canRunAi: boolean;
  onRun?: (taskId: string) => void;
  onContinue?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
}

export function TaskCardFailedDetail({
  task,
  job,
  canRunAi,
  onRun,
  onContinue,
  onDeleteJob,
}: TaskCardFailedDetailProps) {
  return (
    <div className={s.failedSection}>
      {job.phases && job.phases.length > 0 && (
        <div className={s.phases}>
          {job.phases.map((phase, index) => (
            <span key={phase.name} className={s.phaseWrap}>
              {index > 0 && <span className={s.arrow}>&rarr;</span>}
              <span className={`${s.phase} ${s[`ph${capTaskCardToken(phase.status)}`]} ${s[`pn${capTaskCardToken(phase.name)}`] || ''}`}>
                {phase.status === 'completed' && <span className={s.phaseCheck}>&#10003;</span>}
                {phase.name}
              </span>
            </span>
          ))}
        </div>
      )}
      {job.question && <div className={s.errorMsg}>{job.question}</div>}
      <div className={s.failActions}>
        {onContinue && job.phases?.some(phase => phase.status === 'completed') && (() => {
          const nextPhase = job.phases?.find(phase => phase.status !== 'completed');
          return (
            <button className="btn btnPrimary btnSm" onClick={() => onContinue(job.id)}>
              Retry {nextPhase?.name || 'next step'}
            </button>
          );
        })()}
        {canRunAi && onRun && (!task.assignee || task.assignee.type === 'ai') && (
          <button className="btn btnDanger btnSm" onClick={() => onRun(task.id)}>
            Restart
          </button>
        )}
        {onDeleteJob && (
          <button className="btn btnGhost btnSm" onClick={() => onDeleteJob(job.id)}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
