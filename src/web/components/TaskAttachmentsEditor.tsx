import { useArtifacts } from '../hooks/useArtifacts';
import { AttachmentList } from './AttachmentList';
import { useFilePreview } from './filePreviewContext';
import s from './TaskForm.module.css';

interface TaskAttachmentsEditorProps {
  taskId: string;
  projectId?: string;
}

export function TaskAttachmentsEditor({ taskId, projectId }: TaskAttachmentsEditorProps) {
  const { artifacts, upload, remove } = useArtifacts(taskId, projectId);
  const { preview } = useFilePreview();

  return (
    <AttachmentList
      className={s.attachmentsEditor}
      items={artifacts}
      onAddFiles={(files) => {
        for (const file of files) upload(file);
      }}
      onRemoveItem={remove}
      onOpenItem={preview}
      emptyMessage="Drop files here or click + Add"
      extraDropHint="Drop more files here"
    />
  );
}
