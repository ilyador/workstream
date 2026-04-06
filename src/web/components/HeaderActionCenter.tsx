import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActionItem } from './header-types';
import s from './Header.module.css';

interface ActionModalProps {
  title: string;
  items: ActionItem[];
  toneClass: string;
  emptyLabel: string;
  onClose: () => void;
  onSelect: (item: ActionItem) => void;
}

function ActionModal({ title, items, toneClass, emptyLabel, onClose, onSelect }: ActionModalProps) {
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modalCard} ${s.actionModal}`} onClick={event => event.stopPropagation()}>
        <div className={s.actionModalHeader}>
          <span className={s.actionModalTitle}>{title}</span>
          {items.length > 0 && <span className={`${s.actionCount} ${toneClass}`}>{items.length}</span>}
          <button className={s.actionClose} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {items.length === 0 ? (
          <div className={s.actionEmpty}>{emptyLabel}</div>
        ) : (
          <div className={s.actionList}>
            {items.map(item => (
              <button
                key={item.id}
                className={s.actionItem}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <span className={s.actionItemLabel}>{item.label}</span>
                <span className={s.actionItemTags}>
                  {item.tag && <span className={s.actionItemTag}>{item.tag}</span>}
                  {item.sublabel && <span className={s.actionItemPill}>{item.sublabel}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface HeaderActionCenterProps {
  todoItems: ActionItem[];
  reviewItems: ActionItem[];
}

export function HeaderActionCenter({ todoItems, reviewItems }: HeaderActionCenterProps) {
  const navigate = useNavigate();
  const [todoOpen, setTodoOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const handleTodoSelect = (item: ActionItem) => {
    if (item.taskId) {
      navigate(`/?task=${item.taskId}`);
    }
  };

  const handleReviewSelect = (item: ActionItem) => {
    if (item.taskId) {
      navigate(`/?task=${item.taskId}`);
      return;
    }
    if (item.workstreamId) {
      navigate(`/?ws=${item.workstreamId}`);
    }
  };

  return (
    <>
      <div className={s.center}>
        <button
          className={`${s.actionBtn} ${todoItems.length > 0 ? s.actionBtnActive : ''}`}
          onClick={() => {
            setTodoOpen(true);
            setReviewOpen(false);
          }}
        >
          <span className={s.actionLabel}>To Do</span>
          {todoItems.length > 0 && <span className={`${s.actionCount} ${s.actionCountTodo}`}>{todoItems.length}</span>}
        </button>

        <button
          className={`${s.actionBtn} ${reviewItems.length > 0 ? s.actionBtnActive : ''}`}
          onClick={() => {
            setReviewOpen(true);
            setTodoOpen(false);
          }}
        >
          <span className={s.actionLabel}>To Review</span>
          {reviewItems.length > 0 && <span className={`${s.actionCount} ${s.actionCountReview}`}>{reviewItems.length}</span>}
        </button>
      </div>

      {todoOpen && (
        <ActionModal
          title="To Do"
          items={todoItems}
          toneClass={s.actionCountTodo}
          emptyLabel="Nothing to do"
          onClose={() => setTodoOpen(false)}
          onSelect={handleTodoSelect}
        />
      )}

      {reviewOpen && (
        <ActionModal
          title="To Review"
          items={reviewItems}
          toneClass={s.actionCountReview}
          emptyLabel="Nothing to review"
          onClose={() => setReviewOpen(false)}
          onSelect={handleReviewSelect}
        />
      )}
    </>
  );
}
