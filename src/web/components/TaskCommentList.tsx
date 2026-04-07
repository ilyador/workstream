import { timeAgo } from '../lib/time';
import type { useComments } from '../hooks/useComments';
import s from './TaskCard.module.css';

interface TaskCommentListProps {
  comments: ReturnType<typeof useComments>['comments'];
  onRemoveComment: ReturnType<typeof useComments>['removeComment'];
}

export function TaskCommentList({ comments, onRemoveComment }: TaskCommentListProps) {
  return (
    <>
      {comments.map(comment => (
        <div key={comment.id} className={s.comment}>
          <span className={s.commentAvatar}>{comment.profiles?.initials || '??'}</span>
          <div className={s.commentBody}>
            <span className={s.commentText}>{comment.body}</span>
            <span className={s.commentTime}>{timeAgo(comment.created_at)}</span>
          </div>
          <button
            className={s.commentDelete}
            onClick={() => {
              void onRemoveComment(comment.id);
            }}
            title="Delete comment"
            type="button"
          >
            &times;
          </button>
        </div>
      ))}
    </>
  );
}
