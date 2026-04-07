import { useComments } from '../hooks/useComments';
import { TaskCommentComposer } from './TaskCommentComposer';
import { TaskCommentList } from './TaskCommentList';
import type { MentionMember } from './task-card-types';
import s from './TaskCard.module.css';

export function TaskComments({
  taskId,
  projectId,
  expectedCount = 0,
  mentionMembers = [],
}: {
  taskId: string;
  projectId?: string;
  expectedCount?: number;
  mentionMembers?: MentionMember[];
}) {
  const data = useComments(taskId, projectId);
  return <TaskCommentsView data={data} expectedCount={expectedCount} mentionMembers={mentionMembers} />;
}

export function TaskCommentsView({
  data,
  expectedCount = 0,
  mentionMembers = [],
}: {
  data: ReturnType<typeof useComments>;
  expectedCount?: number;
  mentionMembers?: MentionMember[];
}) {
  const { comments, loaded, loading, addComment, removeComment, error } = data;
  const isInitialLoading = loading && !loaded;
  const shouldShowLoadingRows = isInitialLoading && expectedCount > 0;
  const loadingRows = Math.min(expectedCount, 4);
  const loadingClass = loadingRows >= 4
    ? s.commentsLoadingFour
    : loadingRows === 3
      ? s.commentsLoadingThree
      : loadingRows === 2
        ? s.commentsLoadingTwo
        : s.commentsLoadingOne;
  const loadingLabel = expectedCount > 0
    ? `Loading ${expectedCount} comment${expectedCount === 1 ? '' : 's'}`
    : 'Loading comments';

  return (
    <div className={s.commentsSection}>
      <div className={s.commentsHeader}>
        <span className={s.commentsTitle}>Comments</span>
        {isInitialLoading && expectedCount > 0 && <span className={s.commentsEmpty}>Loading...</span>}
        {isInitialLoading && expectedCount === 0 && <span className={s.commentsEmpty}>No comments yet</span>}
        {!isInitialLoading && comments.length === 0 && (
          <span className={s.commentsEmpty}>No comments yet</span>
        )}
      </div>
      {shouldShowLoadingRows ? (
        <div className={`${s.commentsLoading} ${loadingClass}`} aria-live="polite" aria-label={loadingLabel}>
          {Array.from({ length: loadingRows }, (_, index) => (
            <span key={index} className={s.commentSkeletonRow} />
          ))}
        </div>
      ) : (
        <TaskCommentList comments={comments} onRemoveComment={removeComment} />
      )}
      {error && <div className={s.errorMsg}>{error}</div>}
      <TaskCommentComposer mentionMembers={mentionMembers} onAddComment={addComment} />
    </div>
  );
}
