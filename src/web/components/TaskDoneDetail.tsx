import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReplyInput } from './ReplyInput';
import { TaskAttachments } from './TaskAttachments';
import { TaskComments } from './TaskComments';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { MentionMember } from './task-card-types';
import { capTaskCardToken } from './task-card-status';
import s from './TaskCard.module.css';

interface TaskDoneDetailProps {
  task: TaskView;
  job: JobView | null;
  projectId?: string;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onRework?: (jobId: string, note: string) => void;
  onMoveToBacklog?: (jobId: string) => void;
  hideComments?: boolean;
  commentCount?: number;
  mentionMembers?: MentionMember[];
  collapsing?: boolean;
}

export function TaskDoneDetail({
  task,
  job,
  projectId,
  onUpdateTask,
  onRework,
  onMoveToBacklog,
  hideComments,
  commentCount = 0,
  mentionMembers,
  collapsing,
}: TaskDoneDetailProps) {
  const [showDoneReject, setShowDoneReject] = useState(false);
  const descriptionMarkdown = useMemo(
    () => (task.description ? <Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown> : null),
    [task.description],
  );

  return (
    <div onClick={(e) => e.stopPropagation()} className={`${s.doneWrap} ${collapsing ? s.detailClosing : ''}`}>
      <div className={s.doneSection}>
        {job && (
          <>
            <div className={s.doneHeader}>
              <span className={s.doneLabel}>&#10003; Completed {job.completedAgo}</span>
              <button className="btn btnWarning btnSm" onClick={() => setShowDoneReject(v => !v)}>Reject</button>
            </div>
            {showDoneReject && (
              <div className={s.doneRejectPanel}>
                {onRework && (
                  <ReplyInput
                    onReply={(answer) => {
                      onRework(job.id, answer);
                      setShowDoneReject(false);
                    }}
                    placeholder="What needs to change?"
                  />
                )}
                {onMoveToBacklog && (
                  <button className="btn btnGhost btnSm" onClick={() => onMoveToBacklog(job.id)}>
                    Move to backlog
                  </button>
                )}
              </div>
            )}
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
            {job.phases?.some(phase => phase.status === 'completed' && phase.summary) && (
              <div className={s.stepSummaries}>
                {job.phases
                  .filter(phase => phase.status === 'completed' && phase.summary)
                  .map(phase => (
                    <div key={phase.name} className={s.stepSummary}>
                      <span className={`${s.stepName} ${s[`pn${capTaskCardToken(phase.name)}`] || s.stepNameDefault}`}>{phase.name}</span> {phase.summary}
                    </div>
                  ))}
              </div>
            )}
            {job.review?.summary && (
              <div className={s.doneSummary}>{job.review.summary}</div>
            )}
          </>
        )}
        {!job && (
          <div className={s.doneHeader}>
            <span className={s.doneLabel}>&#10003; Completed</span>
            {onUpdateTask && (
              <button className="btn btnGhost btnSm" onClick={() => onUpdateTask(task.id, { status: 'backlog' })}>Unarchive</button>
            )}
          </div>
        )}
        {descriptionMarkdown && <div className={s.desc}>{descriptionMarkdown}</div>}
        <TaskAttachments taskId={task.id} projectId={projectId} legacyImages={task.images} readOnly />
        {!hideComments && (
          <TaskComments taskId={task.id} projectId={projectId} expectedCount={commentCount} mentionMembers={mentionMembers} />
        )}
      </div>
    </div>
  );
}
