import { useRef } from 'react';
import type { Artifact } from '../lib/api';
import { getFileIcon, formatFileSize } from '../lib/file-utils';
import s from './AttachmentList.module.css';

export type AttachmentListItem = Pick<Artifact, 'id' | 'url' | 'filename' | 'mime_type' | 'size_bytes'> & {
  isLegacy?: boolean;
};

interface AttachmentListProps {
  items: AttachmentListItem[];
  readOnly?: boolean;
  title?: string;
  addLabel?: string;
  emptyMessage?: string;
  extraDropHint?: string;
  className?: string;
  separated?: boolean;
  onAddFiles?: (files: File[]) => void;
  onRemoveItem?: (itemId: string) => void;
  onOpenItem?: (item: AttachmentListItem) => void;
}

export function AttachmentList({
  items,
  readOnly,
  title = 'Attachments',
  addLabel = '+ Add',
  emptyMessage = 'Drop files here',
  extraDropHint,
  className,
  separated,
  onAddFiles,
  onRemoveItem,
  onOpenItem,
}: AttachmentListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canEdit = !readOnly && typeof onAddFiles === 'function';

  if (readOnly && items.length === 0) return null;

  const handleFiles = (files: FileList | File[]) => {
    if (!onAddFiles) return;
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) return;
    onAddFiles(nextFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files || []);
    e.target.value = '';
  };

  return (
    <div className={`${s.root} ${separated ? s.separated : ''} ${className || ''}`}>
      <div className={s.header}>
        <span className={s.title}>
          {title}
          {items.length > 0 ? ` (${items.length})` : ''}
        </span>
        {canEdit && (
          <>
            <button type="button" className={s.addButton} onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}>
              {addLabel}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />
          </>
        )}
      </div>

      {items.length > 0 ? (
        <div
          className={s.list}
          {...(canEdit ? {
            onDragOver: (e: React.DragEvent) => e.preventDefault(),
            onDrop: handleDrop,
          } : {})}
        >
          {items.map(item => {
            const clickable = typeof onOpenItem === 'function';

            return (
              <div
                key={item.id}
                className={`${s.item} ${clickable ? s.itemClickable : ''}`}
                onClick={(e) => {
                  if (!onOpenItem) return;
                  e.stopPropagation();
                  onOpenItem(item);
                }}
              >
                {item.mime_type.startsWith('image/') ? (
                  <img src={item.url} alt={item.filename} className={s.thumb} />
                ) : (
                  <span className={s.icon}>{getFileIcon(item.mime_type)}</span>
                )}
                <div className={s.info}>
                  <span className={s.name}>{item.filename}</span>
                  {item.size_bytes > 0 && <span className={s.size}>{formatFileSize(item.size_bytes)}</span>}
                </div>
                {canEdit && !item.isLegacy && onRemoveItem && (
                  <button
                    type="button"
                    className={s.removeButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(item.id);
                    }}
                    title="Remove"
                  >
                    &times;
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : canEdit ? (
        <div className={s.dropZone} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          {emptyMessage}
        </div>
      ) : null}

      {canEdit && items.length > 0 && extraDropHint && (
        <div className={s.dropMore} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          {extraDropHint}
        </div>
      )}
    </div>
  );
}
