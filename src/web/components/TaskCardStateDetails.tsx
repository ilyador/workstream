import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { elapsed } from '../lib/time';
import { LiveLogs } from './LiveLogs';
import { ReplyInput } from './ReplyInput';
import { TaskAttachments } from './TaskAttachments';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import s from './TaskCard.module.css';

function cap(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function TaskCardActiveDetail({
  task,
  job,
  projectId,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRework,
}: {
  task: TaskView;
  job: JobView;
  projectId?: string;
  onTerminate?: (jobId: string) => void;
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onRework?: (jobId: string, note: string) => void;
}) {
  const jobStatus = job.status;
  const [, setElapsedTick] = useState(0);
  const [showRework, setShowRework] = useState(false);

  useEffect(() => {
    if (jobStatus !== 'running' || !job.startedAt) return;
    const interval = setInterval(() => setElapsedTick(tick => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [job.startedAt, jobStatus]);

  const elapsedText = jobStatus === 'running' && job.startedAt ? elapsed(job.startedAt) : '';

  return (
    <div className={s.detail} onClick={(e) => e.stopPropagation()}>
      {task.description && (
        <div className={s.desc}><Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown></div>
      )}

      {jobStatus === 'queued' && (
        <div className={s.runMeta}>
          <span>Queued — waiting for worker to pick up...</span>
        </div>
      )}

      {jobStatus === 'running' && (
        <>
          {job.phases && job.phases.length > 0 && (
            <div className={s.phases}>
              {job.phases.map((phase, index) => (
                <span key={phase.name} className={s.phaseWrap}>
                  {index > 0 && <span className={s.arrow}>&rarr;</span>}
                  <span className={`${s.phase} ${s[`ph${cap(phase.status)}`]} ${s[`pn${cap(phase.name)}`] || ''}`}>
                    {phase.name}
                  </span>
                </span>
              ))}
              <span className={s.runStats}>
                <span>attempt {job.attempt || 1}/{job.maxAttempts || 3}</span>
                {elapsedText && <span className={s.elapsed}>{elapsedText}</span>}
              </span>
            </div>
          )}
          {job.phases?.some(phase => phase.status === 'completed' && phase.summary) && (
            <div className={s.stepSummaries}>
              {job.phases
                .filter(phase => phase.status === 'completed' && phase.summary)
                .map(phase => (
                  <div key={phase.name} className={s.stepSummary}>
                    <span className={s.stepName}>{phase.name}</span> {phase.summary}
                  </div>
                ))}
            </div>
          )}
          {job.question && (
            <div className={s.retryBanner}>{job.question}</div>
          )}
          <LiveLogs
            jobId={job.id}
            footer={onTerminate ? (
              <button className="btn btnDanger btnSm" onClick={() => onTerminate(job.id)}>Terminate</button>
            ) : undefined}
          />
        </>
      )}

      {jobStatus === 'paused' && (
        <>
          {job.question && <div className={s.question}>{job.question}</div>}
          {onReply && (
            <ReplyInput onReply={(answer) => onReply(job.id, answer)} />
          )}
        </>
      )}

      {jobStatus === 'review' && (
        <div className={s.reviewSection}>
          <TaskAttachments taskId={task.id} projectId={projectId} legacyImages={task.images} readOnly />
          {job.review?.changedFiles && (
            <div className={s.files}>
              <span className={s.filesLabel}>Changed files</span>
              {job.review.changedFiles.map(file => (
                <code key={file} className={s.file}>{file}</code>
              ))}
            </div>
          )}
          {job.review?.testsPassed === true && (
            <div className={s.checks}>
              <span className={s.checkOk}>&#10003; Tests pass</span>
            </div>
          )}
          <div className={s.reviewActions}>
            {onApprove && (
              <button className="btn btnSuccess btnSm" onClick={() => onApprove(job.id)}>Approve</button>
            )}
            {onRework && (
              <button
                className="btn btnWarning btnSm"
                onClick={() => setShowRework(value => !value)}
                title="Give feedback and re-run the task"
              >
                Rework
              </button>
            )}
            {onReject && (
              <button className="btn btnDanger btnSm" onClick={() => onReject(job.id)} title="Undo all changes and reset the task">
                Reject
              </button>
            )}
          </div>
          {showRework && onRework && (
            <ReplyInput
              onReply={(answer) => {
                onRework(job.id, answer);
                setShowRework(false);
              }}
              placeholder="What should change?"
            />
          )}
        </div>
      )}
    </div>
  );
}

export function TaskCardFailedDetail({
  task,
  job,
  canRunAi,
  onRun,
  onContinue,
  onDeleteJob,
}: {
  task: TaskView;
  job: JobView;
  canRunAi: boolean;
  onRun?: (taskId: string) => void;
  onContinue?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
}) {
  return (
    <div className={s.failedSection}>
      {job.phases && job.phases.length > 0 && (
        <div className={s.phases}>
          {job.phases.map((phase, index) => (
            <span key={phase.name} className={s.phaseWrap}>
              {index > 0 && <span className={s.arrow}>&rarr;</span>}
              <span className={`${s.phase} ${s[`ph${cap(phase.status)}`]} ${s[`pn${cap(phase.name)}`] || ''}`}>
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
