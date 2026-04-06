import { useArtifacts } from '../hooks/useArtifacts';
import { AttachmentList } from './AttachmentList';
import s from './TaskForm.module.css';

interface TaskAttachmentsEditorProps {
  taskId: string;
}

export function TaskAttachmentsEditor({ taskId }: TaskAttachmentsEditorProps) {
  const { artifacts, upload, remove } = useArtifacts(taskId);

  return (
    <AttachmentList
      className={s.attachmentsEditor}
      items={artifacts}
      onAddFiles={(files) => {
        for (const file of files) upload(file);
      }}
      onRemoveItem={remove}
      onOpenItem={(item) => {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }}
      emptyMessage="Drop files here or click + Add"
      extraDropHint="Drop more files here"
    />
  );
}
