import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ArtifactsData } from '../hooks/useArtifacts';
import { getFileIcon } from '../lib/file-utils';
import type { TaskView } from '../lib/task-view';
import { useFilePreview } from './filePreviewContext';
import s from './TaskCard.module.css';

interface TaskCardPreviewProps {
  task: TaskView;
  filePreviewArtifactsData?: ArtifactsData;
}

export function TaskCardPreview({ task, filePreviewArtifactsData }: TaskCardPreviewProps) {
  const hasFilePreview = Boolean(filePreviewArtifactsData?.loaded && filePreviewArtifactsData.artifacts.length > 0);
  if (!task.description && !hasFilePreview) return null;

  return (
    <div className={s.preview}>
      {task.description && (
        <div className={s.previewDesc}>
          <Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown>
        </div>
      )}
      {hasFilePreview && filePreviewArtifactsData && <TaskCardFilePreview artifactsData={filePreviewArtifactsData} />}
    </div>
  );
}

function TaskCardFilePreview({
  artifactsData,
}: {
  artifactsData: ArtifactsData;
}) {
  const { preview } = useFilePreview();
  const { artifacts, loaded } = artifactsData;
  const files = artifacts.slice(0, 3);
  const extraCount = Math.max(artifacts.length - files.length, 0);

  if (!loaded || artifacts.length === 0) return null;

  return (
    <div className={s.previewFiles}>
      {files.map(file => (
        <button
          key={file.id}
          className={s.previewFile}
          onClick={event => {
            event.stopPropagation();
            preview(file);
          }}
          title={file.filename}
        >
          <span className={s.previewFileIcon}>{getFileIcon(file.mime_type)}</span>
          <span className={s.previewFileName}>{file.filename}</span>
        </button>
      ))}
      {extraCount > 0 && <span className={s.previewFileMore}>+{extraCount}</span>}
    </div>
  );
}
