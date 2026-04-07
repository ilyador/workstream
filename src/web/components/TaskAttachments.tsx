import { useArtifacts, type ArtifactsData } from '../hooks/useArtifacts';
import { useFilePreview } from './filePreviewContext';
import { AttachmentList, type AttachmentListItem } from './AttachmentList';
import s from './TaskCard.module.css';

export function TaskAttachments({
  taskId,
  projectId,
  legacyImages,
  readOnly,
}: {
  taskId: string;
  projectId?: string;
  legacyImages?: string[];
  readOnly?: boolean;
}) {
  const artifactsData = useArtifacts(taskId, projectId);
  return <TaskAttachmentsView artifactsData={artifactsData} legacyImages={legacyImages} readOnly={readOnly} />;
}

export function TaskAttachmentsView({
  artifactsData,
  legacyImages,
  readOnly,
}: {
  artifactsData: ArtifactsData;
  legacyImages?: string[];
  readOnly?: boolean;
}) {
  const { artifacts, loaded, error, upload, remove } = artifactsData;
  const { preview } = useFilePreview();
  const legacyArtifacts: AttachmentListItem[] = (legacyImages || []).map((url, i) => ({
    id: `legacy-${i}`,
    url,
    filename: url.split('/').pop() || `image-${i + 1}`,
    mime_type: 'image/*',
    size_bytes: 0,
    isLegacy: true,
  }));
  const allFiles = [...artifacts.map(a => ({ ...a, isLegacy: false })), ...legacyArtifacts];

  if (error) return <div className={s.errorMsg}>{error}</div>;
  if (!loaded) return null;
  return (
    <AttachmentList
      items={allFiles}
      readOnly={readOnly}
      separated
      onAddFiles={readOnly ? undefined : (files) => {
        for (const file of files) upload(file);
      }}
      onRemoveItem={readOnly ? undefined : remove}
      onOpenItem={preview}
    />
  );
}
