import { useState } from 'react';
import type { WorkstreamView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

interface WorkstreamColumnStatusBannersProps {
  workstream: WorkstreamView | null;
  wsStatus: string | null;
  allDone: boolean;
  isBacklog: boolean;
  onCreatePr?: (options?: { review?: boolean }) => void;
  onArchive?: () => void;
  currentUserId?: string;
  members?: Array<{ id: string; name: string; initials: string }>;
  onUpdateWorkstream?: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export function WorkstreamColumnStatusBanners({
  workstream,
  wsStatus,
  allDone,
  isBacklog,
  onCreatePr,
  onArchive,
  currentUserId,
  members,
  onUpdateWorkstream,
}: WorkstreamColumnStatusBannersProps) {
  const [reviewerError, setReviewerError] = useState<string | null>(null);

  const renderReviewer = () => {
    if (!workstream || !members || members.length === 0 || !onUpdateWorkstream) return null;
    if (workstream.reviewer_id) {
      const reviewer = members.find(m => m.id === workstream.reviewer_id);
      return reviewer ? (
        <span className={s.reviewerChip}>
          <span className={s.reviewerAvatar}>{reviewer.initials}</span>
          {reviewer.name}
        </span>
      ) : null;
    }
    return (
      <select
        className={s.reviewerSelect}
        defaultValue=""
        onChange={async e => {
          if (!e.target.value) return;
          setReviewerError(null);
          try {
            await onUpdateWorkstream(workstream.id, { reviewer_id: e.target.value });
          } catch (err) {
            setReviewerError(err instanceof Error ? err.message : 'Failed to assign reviewer');
            e.currentTarget.value = '';
          }
        }}
      >
        <option value="">Assign reviewer</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  };

  return (
    <>
      {allDone && !isBacklog && wsStatus === 'pending review' && (
        <div className={s.completeBanner}>
          <span>&#10003; All tasks complete</span>
          {workstream?.has_code !== false && onCreatePr && (
            <button className="btn btnPrimary btnSm" onClick={() => onCreatePr({ review: true })}>Review &amp; Create PR</button>
          )}
        </div>
      )}

      {wsStatus === 'reviewing' && (
        <div className={`${s.completeBanner} ${s.reviewingBanner}`}>
          <span className={s.reviewingLabel}>
            <span className={s.reviewingDot} />
            Reviewing code...
          </span>
        </div>
      )}

      {wsStatus === 'review failed' && (
        <div className={`${s.completeBanner} ${s.failedBanner}`}>
          <div>
            <span>Review failed</span>
            {workstream?.review_output && (
              <div className={s.failedDetail}>{workstream.review_output}</div>
            )}
          </div>
          {onCreatePr && (
            <button className="btn btnDanger btnSm" onClick={() => onCreatePr({ review: true })}>Retry</button>
          )}
        </div>
      )}

      {wsStatus === 'done' && (
        <div className={`${s.completeBanner} ${s.doneBanner}`}>
          <div className={s.doneHeader}>
            <span className={s.doneLabel}>{workstream?.pr_url ? 'PR open' : '\u2713 Complete'}</span>
            <div className={s.completeBannerActions}>
              {workstream?.pr_url && renderReviewer()}
              {workstream?.pr_url && (
                <a href={workstream.pr_url} target="_blank" rel="noopener noreferrer" className={s.prLink}>
                  View PR
                </a>
              )}
            </div>
          </div>
          {reviewerError && <div className={s.bannerError}>{reviewerError}</div>}
          {workstream?.review_output && (
            <pre className={s.reviewOutput}>{workstream.review_output}</pre>
          )}
          {onCreatePr && ((!workstream?.pr_url) || (workstream?.pr_url && !workstream?.review_output)) && (
            <div className={s.reviewActions}>
              {!workstream?.pr_url && (
                <button className="btn btnPrimary btnSm" onClick={() => onCreatePr()}>Create PR</button>
              )}
              {workstream?.pr_url && !workstream?.review_output && (
                <button className="btn btnWarning btnSm" onClick={() => onCreatePr({ review: true })}>Review &amp; Fix</button>
              )}
            </div>
          )}
          {onArchive && currentUserId && workstream?.reviewer_id === currentUserId && (
            <button className={s.archiveBtn} onClick={onArchive}>Archive</button>
          )}
        </div>
      )}

      {wsStatus === 'merged' && (
        <div className={`${s.completeBanner} ${s.mergedBanner}`}>
          <span>&#10003; PR merged</span>
          <div className={s.completeBannerActions}>
            {renderReviewer()}
            {workstream?.pr_url && (
              <a href={workstream.pr_url} target="_blank" rel="noopener noreferrer" className={s.prLink}>
                View PR
              </a>
            )}
            {onArchive && currentUserId && workstream?.reviewer_id === currentUserId && (
              <button className={s.archiveBtn} onClick={onArchive}>
                Archive
              </button>
            )}
          </div>
          {reviewerError && <div className={s.bannerError}>{reviewerError}</div>}
        </div>
      )}
    </>
  );
}
