import type { Flow } from '../lib/api';
import { TaskDescriptionField } from './TaskDescriptionField';
import { TaskImagesSection } from './TaskImagesSection';
import { TaskAttachmentsEditor } from './TaskAttachmentsEditor';
import { TaskFormOptions } from './TaskFormOptions';
import { type CustomTypeOption, type MemberOption, type WorkstreamOption } from './task-form-shared';
import type { EditTaskData, TaskFormData } from './task-form-types';
import { useExitAnimation } from '../hooks/useExitAnimation';
import { useTaskFormState } from '../hooks/useTaskFormState';
import { ModalCloseButton } from './ModalCloseButton';
import s from './TaskForm.module.css';

interface Props {
  workstreams: WorkstreamOption[];
  members: MemberOption[];
  flows?: Flow[];
  customTypes?: CustomTypeOption[];
  onSaveCustomType?: (name: string, pipeline: string) => Promise<void>;
  localPath?: string;
  projectId?: string;
  defaultWorkstreamId?: string | null;
  editTask?: EditTaskData;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onClose: () => void;
}

export function TaskForm({ workstreams, members, flows = [], customTypes = [], onSaveCustomType, localPath, projectId, defaultWorkstreamId, editTask, onSubmit, onClose }: Props) {
  const { closing, closeWithAnimation } = useExitAnimation(onClose);
  const {
    isEdit,
    title,
    setTitle,
    description,
    setDescription,
    type,
    setType,
    customType,
    setCustomType,
    customPipeline,
    setCustomPipeline,
    isCustomType,
    setIsCustomType,
    assignee,
    setAssignee,
    flowId,
    setFlowId,
    effort,
    setEffort,
    workstreamId,
    setWorkstreamId,
    priority,
    setPriority,
    multiagent,
    setMultiagent,
    autoContinue,
    setAutoContinue,
    chaining,
    setChaining,
    mode,
    setMode,
    error,
    handleSubmit,
    imagesState,
    submitDisabled,
    submitLabel,
  } = useTaskFormState({
    flows,
    customTypes,
    defaultWorkstreamId,
    editTask,
    onSaveCustomType,
    onSubmit,
    onClose: closeWithAnimation,
  });

  const {
    images,
    dragOver,
    fileInputRef,
    setDragOver,
    handleImageDrop,
    handleImagePaste,
    handleFileSelect,
    removeImage,
  } = imagesState;

  return (
    <div className={`${s.overlay} ${closing ? s.overlayClosing : ''}`} onClick={closeWithAnimation}>
      <div
        className={`${s.modal} ${s.modalBody} ${dragOver ? s.modalDragOver : ''} ${closing ? s.modalClosing : ''}`}
        onClick={e => e.stopPropagation()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={e => { handleImageDrop(e); setDragOver(false); }}
      >
        <ModalCloseButton onClick={closeWithAnimation} />
        <h2 className={s.heading}>{isEdit ? 'Edit task' : 'New task'}</h2>
        <form onSubmit={handleSubmit} className={s.form}>
          <input
            className={s.input}
            placeholder="Task title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            autoFocus
          />
          <TaskDescriptionField
            mode={mode}
            value={description}
            localPath={localPath}
            onChange={setDescription}
            onImagePaste={handleImagePaste}
          />
          <TaskFormOptions
            workstreams={workstreams}
            members={members}
            flows={flows}
            customTypes={customTypes}
            type={type}
            customType={customType}
            customPipeline={customPipeline}
            isCustomType={isCustomType}
            assignee={assignee}
            flowId={flowId}
            effort={effort}
            workstreamId={workstreamId}
            priority={priority}
            multiagent={multiagent}
            autoContinue={autoContinue}
            chaining={chaining}
            setType={setType}
            setCustomType={setCustomType}
            setCustomPipeline={setCustomPipeline}
            setIsCustomType={setIsCustomType}
            setAssignee={setAssignee}
            setFlowId={setFlowId}
            setMode={setMode}
            setEffort={setEffort}
            setWorkstreamId={setWorkstreamId}
            setPriority={setPriority}
            setMultiagent={setMultiagent}
            setAutoContinue={setAutoContinue}
            setChaining={setChaining}
          />

          <TaskImagesSection
            images={images}
            dragOver={dragOver}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onRemoveImage={removeImage}
          />

          {isEdit && editTask?.id && (
            <div>
              <label className={s.label}>Attachments</label>
              {(chaining === 'produce' || chaining === 'both') && (
              <div className={s.attachmentNotice}>
                This task requires a file attachment before it can be completed
              </div>
            )}
              <TaskAttachmentsEditor taskId={editTask.id} projectId={projectId} />
            </div>
          )}

          {error && <div className={s.error}>{error}</div>}

          <div className={s.actions}>
            <button className="btn btnPrimary" type="submit" disabled={submitDisabled}>
              {submitLabel}
            </button>
            <button className="btn btnSecondary" type="button" onClick={closeWithAnimation}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
