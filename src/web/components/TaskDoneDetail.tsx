import { useState } from 'react';
import { ReplyInput } from './ReplyInput';
import { TaskAttachments } from './TaskAttachments';
import { TaskComments } from './TaskComments';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { MentionMember } from './task-card-types';
import s from './TaskCard.module.css';

interface TaskDoneDetailProps {
  task: TaskView;
  job: JobView | null;
  projectId?: string;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onRework?: (jobId: string, note: string) => void;
  onMoveToBacklog?: (jobId: string) => void;
  hideComments?: boolean;
  mentionMembers?: MentionMember[];
}

export function TaskDoneDetail({
  task,
  job,
  projectId,
  onUpdateTask,
  onRework,
  onMoveToBacklog,
  hideComments,
  mentionMembers,
}: TaskDoneDetailProps) {
  const [showDoneReject, setShowDoneReject] = useState(false);

  return (
    <div onClick={(e) => e.stopPropagation()} className={s.doneWrap}>
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
        <TaskAttachments taskId={task.id} projectId={projectId} legacyImages={task.images} readOnly />
        {!hideComments && (
          <TaskComments taskId={task.id} projectId={projectId} mentionMembers={mentionMembers} />
        )}
      </div>
    </div>
  );
}
