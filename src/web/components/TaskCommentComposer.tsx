import { useCommentComposer } from '../hooks/useCommentComposer';
import type { useComments } from '../hooks/useComments';
import type { MentionMember } from './task-card-types';
import s from './TaskCard.module.css';

interface TaskCommentComposerProps {
  mentionMembers: MentionMember[];
  onAddComment: ReturnType<typeof useComments>['addComment'];
}

export function TaskCommentComposer({ mentionMembers, onAddComment }: TaskCommentComposerProps) {
  const {
    text,
    sending,
    inputRef,
    mentionMatches,
    mentionIdx,
    handleSend,
    insertMention,
    handleChange,
    handleKeyDown,
  } = useCommentComposer({ mentionMembers, addComment: onAddComment });

  return (
    <div className={s.commentComposerWrap}>
      {mentionMatches.length > 0 && (
        <div className={s.mentionMenu}>
          {mentionMatches.map((member, index) => (
            <div
              key={member.id}
              onMouseDown={(event) => {
                event.preventDefault();
                insertMention(member.name);
              }}
              className={`${s.mentionItem} ${index === mentionIdx ? s.mentionItemActive : ''}`}
            >
              <span className={s.mentionAvatar}>{member.initials}</span>
              {member.name}
            </div>
          ))}
        </div>
      )}
      <div className={s.commentComposer}>
        <textarea
          ref={inputRef}
          rows={1}
          className={s.commentInput}
          value={text}
          onChange={event => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment... (@mention)"
          disabled={sending}
        />
        <button
          className={`btn btnPrimary btnSm ${s.commentSend}`}
          onClick={() => {
            void handleSend();
          }}
          disabled={sending || !text.trim()}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
