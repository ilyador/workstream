import { formatFileSize } from '../lib/file-utils';
import { useExitAnimation } from '../hooks/useExitAnimation';
import type { PreviewFile } from './filePreviewContext';
import { FilePreviewContent } from './FilePreviewContent';
import { isMdFile, isPreviewable } from './file-preview-utils';
import s from './FilePreview.module.css';

interface FilePreviewModalProps {
  file: PreviewFile;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  contentKey: number;
  onClose: () => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onTextChange: (text: string) => void;
}

export function FilePreviewModal({
  file,
  editing,
  dirty,
  saving,
  error,
  contentKey,
  onClose,
  onStartEdit,
  onSave,
  onCancelEdit,
  onTextChange,
}: FilePreviewModalProps) {
  const { closing, closeWithAnimation } = useExitAnimation(onClose);
  const canEdit = isMdFile(file.mime_type, file.filename) && !!file.id;

  return (
    <div className={`${s.overlay} ${closing ? s.overlayClosing : ''}`} onClick={closeWithAnimation}>
      <div className={`${s.modal} ${closing ? s.modalClosing : ''}`} onClick={event => event.stopPropagation()}>
        <FilePreviewHeader
          file={file}
          canEdit={canEdit}
          editing={editing}
          dirty={dirty}
          saving={saving}
          onStartEdit={onStartEdit}
          onSave={onSave}
          onCancelEdit={onCancelEdit}
          onClose={closeWithAnimation}
        />
        <div className={s.body}>
          {error && <div className={s.error}>{error}</div>}
          {isPreviewable(file.mime_type) ? (
            <FilePreviewContent
              key={contentKey}
              file={file}
              editing={editing}
              onTextChange={onTextChange}
            />
          ) : (
            <div className={s.unsupported}>
              <div className={s.unsupportedIcon}>&#128196;</div>
              <div className={s.unsupportedText}>Preview not available for this file type</div>
              <a href={file.url} download={file.filename} className="btn btnPrimary">Download file</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilePreviewHeader({
  file,
  canEdit,
  editing,
  dirty,
  saving,
  onStartEdit,
  onSave,
  onCancelEdit,
  onClose,
}: {
  file: PreviewFile;
  canEdit: boolean;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onClose: () => void;
}) {
  return (
    <div className={s.header}>
      <div className={s.headerInfo}>
        <span className={s.filename}>{file.filename}</span>
        {file.size_bytes ? <span className={s.size}>{formatFileSize(file.size_bytes)}</span> : null}
      </div>
      <div className={s.headerActions}>
        {canEdit && !editing && (
          <button className={s.editBtn} onClick={onStartEdit} title="Edit" type="button">
            <EditIcon />
          </button>
        )}
        {editing && (
          <>
            <button
              className={`btn btnPrimary btnSm ${s.saveBtn}`}
              onClick={onSave}
              disabled={saving || !dirty}
              type="button"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className="btn btnGhost btnSm"
              onClick={onCancelEdit}
              type="button"
            >
              Cancel
            </button>
          </>
        )}
        <a href={file.url} download={file.filename} className={s.downloadBtn} title="Download">
          <DownloadIcon />
        </a>
        <button className={s.closeBtn} onClick={onClose} type="button">&times;</button>
      </div>
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
