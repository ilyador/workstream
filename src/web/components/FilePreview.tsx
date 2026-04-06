import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatFileSize } from '../lib/file-utils';
import { updateArtifactContent } from '../lib/api';
import s from './FilePreview.module.css';

interface PreviewFile {
  id?: string;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

interface FilePreviewContextValue {
  preview: (file: PreviewFile) => void;
}

const FilePreviewContext = createContext<FilePreviewContextValue>({ preview: () => {} });

export function useFilePreview() {
  return useContext(FilePreviewContext);
}

const PREVIEWABLE = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/json',
  'application/pdf',
];

function isPreviewable(mime: string): boolean {
  return PREVIEWABLE.some(p => mime.startsWith(p));
}

function isMdFile(mime: string, filename: string): boolean {
  return mime === 'text/markdown' || filename.endsWith('.md');
}

function PreviewContent({ file, editing, onTextChange }: { file: PreviewFile; editing: boolean; onTextChange?: (text: string) => void }) {
  const { mime_type: mime, url, filename } = file;
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isText = mime.startsWith('text/') || mime === 'application/json';
    if (!isText) return;
    setLoading(true);
    fetch(url)
      .then(r => r.text())
      .then(t => { setText(t); onTextChange?.(t); setLoading(false); })
      .catch(() => { setText('Failed to load file'); setLoading(false); });
  }, [url, mime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Images
  if (mime.startsWith('image/')) {
    return <img src={url} alt={filename} className={s.previewImage} />;
  }

  // Video
  if (mime.startsWith('video/')) {
    return <video src={url} controls className={s.previewVideo} />;
  }

  // Audio
  if (mime.startsWith('audio/')) {
    return (
      <div className={s.audioWrap}>
        <div className={s.audioIcon}>&#9835;</div>
        <div className={s.audioName}>{filename}</div>
        <audio src={url} controls className={s.previewAudio} />
      </div>
    );
  }

  // PDF
  if (mime === 'application/pdf') {
    return <iframe src={url} className={s.previewPdf} title={filename} />;
  }

  // Markdown
  if (isMdFile(mime, filename)) {
    if (loading) return <div className={s.loading}>Loading...</div>;
    if (editing) {
      return (
        <textarea
          className={s.mdEditor}
          value={text || ''}
          onChange={e => { setText(e.target.value); onTextChange?.(e.target.value); }}
          spellCheck={false}
        />
      );
    }
    return (
      <div className={s.previewMarkdown}>
        <Markdown remarkPlugins={[remarkGfm]}>{text || ''}</Markdown>
      </div>
    );
  }

  // JSON
  if (mime === 'application/json') {
    if (loading) return <div className={s.loading}>Loading...</div>;
    let formatted = text || '';
    try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch {}
    return <pre className={s.previewCode}>{formatted}</pre>;
  }

  // Other text
  if (mime.startsWith('text/')) {
    if (loading) return <div className={s.loading}>Loading...</div>;
    return <pre className={s.previewCode}>{text || ''}</pre>;
  }

  return null;
}

export function FilePreviewProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PreviewFile | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const textRef = useRef('');
  const canceledRef = useRef(false);

  const preview = useCallback((f: PreviewFile) => {
    if (isPreviewable(f.mime_type)) {
      setFile(f);
      setEditing(false);
      setDirty(false);
    } else {
      window.open(f.url, '_blank');
    }
  }, []);

  const close = useCallback(() => {
    setFile(null);
    setEditing(false);
    setDirty(false);
  }, []);

  const handleTextChange = useCallback((text: string) => {
    textRef.current = text;
  }, []);

  const handleSave = useCallback(async () => {
    if (!file?.id || saving) return;
    setSaving(true);
    try {
      await updateArtifactContent(file.id, textRef.current);
      setDirty(false);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save artifact:', err);
    } finally {
      setSaving(false);
    }
  }, [file?.id, saving]);

  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [file, close]);

  const canEdit = file ? isMdFile(file.mime_type, file.filename) && !!file.id : false;

  return (
    <FilePreviewContext.Provider value={{ preview }}>
      {children}
      {file && (
        <div className={s.overlay} onClick={close}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.header}>
              <div className={s.headerInfo}>
                <span className={s.filename}>{file.filename}</span>
                {file.size_bytes ? <span className={s.size}>{formatFileSize(file.size_bytes)}</span> : null}
              </div>
              <div className={s.headerActions}>
                {canEdit && !editing && (
                  <button className={s.editBtn} onClick={() => setEditing(true)} title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      className={`btn btnPrimary btnSm ${s.saveBtn}`}
                      onClick={handleSave}
                      disabled={saving || !dirty}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="btn btnGhost btnSm"
                      onClick={() => { canceledRef.current = true; setEditing(false); setDirty(false); setContentKey(k => k + 1); }}
                    >
                      Cancel
                    </button>
                  </>
                )}
                <a href={file.url} download={file.filename} className={s.downloadBtn} title="Download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
                <button className={s.closeBtn} onClick={close}>&times;</button>
              </div>
            </div>
            <div className={s.body}>
              {isPreviewable(file.mime_type) ? (
                <PreviewContent
                  key={contentKey}
                  file={file}
                  editing={editing}
                  onTextChange={(text) => {
                    handleTextChange(text);
                    if (canceledRef.current) { canceledRef.current = false; return; }
                    if (editing) setDirty(true);
                  }}
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
      )}
    </FilePreviewContext.Provider>
  );
}
