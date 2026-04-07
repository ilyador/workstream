import { useState } from 'react';
import s from './Header.module.css';

interface HeaderAccountControlsProps {
  localPath?: string;
  onUpdateLocalPath?: (path: string) => void;
}

export function HeaderAccountControls({
  localPath,
  onUpdateLocalPath,
}: HeaderAccountControlsProps) {
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');

  return (
    <>
      {onUpdateLocalPath && (editingPath ? (
        <input
          className={s.localPathInput}
          value={pathDraft}
          onChange={event => setPathDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              if (event.key === 'Enter') {
                const value = pathDraft.trim();
                if (value && value !== (localPath || '')) onUpdateLocalPath(value);
              }
              setEditingPath(false);
            }
          }}
          onBlur={() => {
            const value = pathDraft.trim();
            if (value && value !== (localPath || '')) onUpdateLocalPath(value);
            setEditingPath(false);
          }}
          placeholder="/path/to/project"
          autoFocus
        />
      ) : (
        <button
          className={s.localPathBtn}
          onClick={() => {
            setPathDraft(localPath || '');
            setEditingPath(true);
          }}
          title={localPath ? `Click to edit: ${localPath}` : 'Set project local path'}
        >
          {localPath || 'Set path...'}
        </button>
      ))}
    </>
  );
}
