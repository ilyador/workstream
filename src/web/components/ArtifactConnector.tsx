import { useState } from 'react';
import s from './ArtifactConnector.module.css';
import { useArtifacts } from '../hooks/useArtifacts';
import { useExitAnimation } from '../hooks/useExitAnimation';
import { getFileIcon } from '../lib/file-utils';
import { useFilePreview } from './filePreviewContext';

interface Props {
  taskId: string;  // The producing task's ID
  projectId?: string;
}

export function ArtifactConnector({ taskId, projectId }: Props) {
  const { artifacts, loading } = useArtifacts(taskId, projectId);
  const { preview } = useFilePreview();
  const [expanded, setExpanded] = useState(false);
  const { closing, closeWithAnimation, cancelExitAnimation } = useExitAnimation(() => setExpanded(false), 140);
  const hasFiles = !loading && artifacts.length > 0;
  const fileListVisible = expanded || closing;
  const toggleExpanded = () => {
    if (expanded) {
      closeWithAnimation();
      return;
    }
    cancelExitAnimation();
    setExpanded(true);
  };

  return (
    <div className={s.connector}>
      <div className={`${s.line} ${hasFiles ? s.lineActive : ''}`} />
      <button
        className={`${s.icon} ${hasFiles ? s.iconActive : ''}`}
        onClick={hasFiles ? toggleExpanded : undefined}
        title={hasFiles ? `${artifacts.length} file${artifacts.length > 1 ? 's' : ''}` : 'File chain'}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {hasFiles && <span className={s.count}>{artifacts.length}</span>}
      </button>
      {fileListVisible && hasFiles && (
        <div className={`${s.fileList} ${closing ? s.fileListClosing : ''}`}>
          {artifacts.map(a => (
            <button key={a.id} className={s.fileItem} onClick={() => preview(a)}>
              <span className={s.fileIcon}>{getFileIcon(a.mime_type)}</span>
              <span className={s.fileName}>{a.filename}</span>
            </button>
          ))}
        </div>
      )}
      <div className={`${s.line} ${hasFiles ? s.lineActive : ''}`} />
    </div>
  );
}
