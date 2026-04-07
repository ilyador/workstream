import { useEffect, useRef, useState } from 'react';
import s from './Board.module.css';

interface AddWorkstreamComposerProps {
  onCreateWorkstream: (name: string, description?: string, hasCode?: boolean) => Promise<void>;
}

const CLOSE_ANIMATION_MS = 160;

export function AddWorkstreamComposer({ onCreateWorkstream }: AddWorkstreamComposerProps) {
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hasCode, setHasCode] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const clearFields = () => {
    setName('');
    setDescription('');
    setHasCode(true);
  };

  const open = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setAdding(true);
  };

  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setAdding(false);
      setClosing(false);
      clearFields();
    }, CLOSE_ANIMATION_MS);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await onCreateWorkstream(trimmedName, description.trim() || undefined, hasCode);
    close();
  };

  if (!adding) {
    return (
      <button className={s.addColumn} onClick={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add workstream
      </button>
    );
  }

  return (
    <div className={`${s.addForm} ${closing ? s.addFormClosing : ''}`}>
      <div className={s.addFormHeader}>
        <span className={s.addFormKicker}>New stream</span>
        <strong>Plan a workstream</strong>
      </div>
      <input
        className={s.addInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate();
          if (e.key === 'Escape') close();
        }}
        placeholder="Workstream name..."
        autoFocus
      />
      <input
        className={s.addInput}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate();
          if (e.key === 'Escape') close();
        }}
        placeholder="Goal (optional, max 100 chars)"
        maxLength={100}
      />
      <label className={s.addCheckboxLabel}>
        <input type="checkbox" checked={hasCode} onChange={(e) => setHasCode(e.target.checked)} />
        <span>
          <strong>Code workstream</strong>
          <small>Enable PR flow on completion</small>
        </span>
      </label>
      <div className={s.addActions}>
        <button className="btn btnPrimary btnSm" onClick={() => void handleCreate()}>Add</button>
        <button className="btn btnGhost btnSm" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}
