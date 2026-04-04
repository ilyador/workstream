import { useState } from 'react';
import s from './ArtifactConnector.module.css';
import { useArtifacts } from '../hooks/useArtifacts';

interface Props {
  taskId: string;  // The producing task's ID
}

export function ArtifactConnector({ taskId }: Props) {
  const { artifacts, loading } = useArtifacts(taskId);
  const [expanded, setExpanded] = useState(false);
  if (loading || artifacts.length === 0) return null;

  const getIcon = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼';
    if (mime.startsWith('video/')) return '🎬';
    if (mime === 'application/pdf') return '📕';
    if (mime.includes('zip')) return '📦';
    return '📄';
  };

  return (
    <div className={s.connector}>
      <div className={s.line} />
      <button className={s.pill} onClick={() => setExpanded(!expanded)}>
        📎 {artifacts.length} file{artifacts.length > 1 ? 's' : ''} ↓
      </button>
      {expanded && (
        <div className={s.fileList}>
          {artifacts.map(a => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className={s.fileItem}>
              <span className={s.fileIcon}>{getIcon(a.mime_type)}</span>
              <span className={s.fileName}>{a.filename}</span>
            </a>
          ))}
        </div>
      )}
      <div className={s.line} />
    </div>
  );
}
