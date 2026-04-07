import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { updateArtifactContent } from '../lib/api';
import { FilePreviewContext, type PreviewFile } from './filePreviewContext';
import { FilePreviewModal } from './FilePreviewModal';

export function FilePreviewProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PreviewFile | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [contentKey, setContentKey] = useState(0);
  const textRef = useRef('');
  const canceledRef = useRef(false);

  const preview = useCallback((nextFile: PreviewFile) => {
    setFile(nextFile);
    setEditing(false);
    setDirty(false);
    setSaveError(null);
  }, []);

  const close = useCallback(() => {
    setFile(null);
    setEditing(false);
    setDirty(false);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!file?.id || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateArtifactContent(file.id, textRef.current);
      setDirty(false);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save artifact');
    } finally {
      setSaving(false);
    }
  }, [file?.id, saving]);

  const handleCancelEdit = useCallback(() => {
    canceledRef.current = true;
    setEditing(false);
    setDirty(false);
    setSaveError(null);
    setContentKey(key => key + 1);
  }, []);

  const handleTextChange = useCallback((text: string) => {
    textRef.current = text;
    if (canceledRef.current) {
      canceledRef.current = false;
      return;
    }
    if (editing) setDirty(true);
  }, [editing]);

  useEffect(() => {
    if (!file) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [file, close]);

  return (
    <FilePreviewContext.Provider value={{ preview }}>
      {children}
      {file && (
        <FilePreviewModal
          file={file}
          editing={editing}
          dirty={dirty}
          saving={saving}
          error={saveError}
          contentKey={contentKey}
          onClose={close}
          onStartEdit={() => setEditing(true)}
          onSave={handleSave}
          onCancelEdit={handleCancelEdit}
          onTextChange={handleTextChange}
        />
      )}
    </FilePreviewContext.Provider>
  );
}
