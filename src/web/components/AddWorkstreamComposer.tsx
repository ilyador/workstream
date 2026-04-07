import { useState } from 'react';
import s from './Board.module.css';

interface AddWorkstreamComposerProps {
  onCreateWorkstream: (name: string, description?: string, hasCode?: boolean) => Promise<void>;
}

export function AddWorkstreamComposer({ onCreateWorkstream }: AddWorkstreamComposerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hasCode, setHasCode] = useState(true);

  const reset = () => {
    setAdding(false);
    setName('');
    setDescription('');
    setHasCode(true);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await onCreateWorkstream(trimmedName, description.trim() || undefined, hasCode);
    reset();
  };

  if (!adding) {
    return (
      <button className={s.addColumn} onClick={() => setAdding(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add workstream
      </button>
    );
  }

  return (
    <div className={s.addForm}>
      <input
        className={s.addInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate();
          if (e.key === 'Escape') reset();
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
          if (e.key === 'Escape') reset();
        }}
        placeholder="Goal (optional, max 100 chars)"
        maxLength={100}
      />
      <label className={s.addCheckboxLabel}>
        <input type="checkbox" checked={hasCode} onChange={(e) => setHasCode(e.target.checked)} />
        Code (PR flow on completion)
      </label>
      <button className="btn btnPrimary btnSm" onClick={() => void handleCreate()}>Add</button>
      <button className="btn btnGhost btnSm" onClick={reset}>Cancel</button>
    </div>
  );
}
