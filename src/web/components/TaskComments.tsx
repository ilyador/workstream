import { useComments } from '../hooks/useComments';
import { TaskCommentComposer } from './TaskCommentComposer';
import { TaskCommentList } from './TaskCommentList';
import type { MentionMember } from './task-card-types';
import s from './TaskCard.module.css';

export function TaskComments({
  taskId,
  projectId,
  mentionMembers = [],
}: {
  taskId: string;
  projectId?: string;
  mentionMembers?: MentionMember[];
}) {
  const data = useComments(taskId, projectId);
  return <TaskCommentsView data={data} mentionMembers={mentionMembers} />;
}

export function TaskCommentsView({
  data,
  mentionMembers = [],
}: {
  data: ReturnType<typeof useComments>;
  mentionMembers?: MentionMember[];
}) {
  const { comments, loaded, loading, addComment, removeComment, error } = data;
  const isInitialLoading = loading && !loaded;

  return (
    <div className={s.commentsSection}>
      <div className={s.commentsHeader}>
        <span className={s.commentsTitle}>Comments</span>
        {isInitialLoading && <span className={s.commentsEmpty}>Loading...</span>}
        {!isInitialLoading && comments.length === 0 && (
          <span className={s.commentsEmpty}>No comments yet</span>
        )}
      </div>
      {isInitialLoading ? (
        <div className={s.commentsLoading} aria-live="polite">Loading comments...</div>
      ) : (
        <TaskCommentList comments={comments} onRemoveComment={removeComment} />
      )}
      {error && <div className={s.errorMsg}>{error}</div>}
      <TaskCommentComposer mentionMembers={mentionMembers} onAddComment={addComment} />
    </div>
  );
}
