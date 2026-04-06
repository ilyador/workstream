import { useState, useEffect } from 'react';
import type { Flow } from '../lib/api';
import { TaskDescriptionField } from './TaskDescriptionField';
import { TaskImagesSection } from './TaskImagesSection';
import { TaskAttachmentsEditor } from './TaskAttachmentsEditor';
import { TaskFormOptions } from './TaskFormOptions';
import { useTaskImages } from '../hooks/useTaskImages';
import { getPreferredFlowId, type CustomTypeOption, type MemberOption, type WorkstreamOption } from './task-form-shared';
import s from './TaskForm.module.css';

export interface TaskFormData {
  title: string;
  description: string;
  type: string;
  mode: string;
  effort: string;
  multiagent: string;
  assignee: string | null;
  flow_id: string | null;
  auto_continue: boolean;
  images: string[];
  workstream_id: string | null;
  priority: string;
  chaining: string;
}

export interface EditTaskData {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  assignee?: string | null;
  flow_id?: string | null;
  auto_continue?: boolean;
  images?: string[];
  workstream_id?: string | null;
  priority?: string;
  chaining?: string;
}

interface Props {
  workstreams: WorkstreamOption[];
  members: MemberOption[];
  flows?: Flow[];
  customTypes?: CustomTypeOption[];
  onSaveCustomType?: (name: string, pipeline: string) => Promise<void>;
  localPath?: string;
  defaultWorkstreamId?: string | null;
  editTask?: EditTaskData;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onClose: () => void;
}

export function TaskForm({ workstreams, members, flows = [], customTypes = [], onSaveCustomType, localPath, defaultWorkstreamId, editTask, onSubmit, onClose }: Props) {
  const isEdit = !!editTask;

  // Determine if the editTask type is a custom (non-built-in) type
  const editTypeIsCustom = isEdit && !BUILT_IN_TYPES.includes(editTask!.type);
  // Check if the custom type is already saved (known custom type vs truly new)
  const editTypeIsSavedCustom = editTypeIsCustom && customTypes.some(ct => ct.name === editTask!.type);

  const [title, setTitle] = useState(editTask?.title || '');
  const [description, setDescription] = useState(editTask?.description || '');
  const [type, setType] = useState(editTypeIsSavedCustom ? editTask!.type : (editTypeIsCustom ? 'feature' : (editTask?.type || 'feature')));
  const [customType, setCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom ? editTask!.type : '');
  const [customPipeline, setCustomPipeline] = useState(() => {
    if (editTypeIsSavedCustom) {
      return customTypes.find(ct => ct.name === editTask!.type)?.pipeline || 'feature';
    }
    return 'feature';
  });
  const [isCustomType, setIsCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom);
  const [mode, setMode] = useState(editTask?.mode || 'ai');
  const [effort, setEffort] = useState(editTask?.effort || 'max');
  const [workstreamId, setWorkstreamId] = useState(editTask?.workstream_id || defaultWorkstreamId || '');
  const [assignee, setAssignee] = useState(editTask?.assignee || '');
  const [flowId, setFlowId] = useState(isEdit ? (editTask?.flow_id ?? '') : getPreferredFlowId(flows, 'feature'));
  const preferredFlowId = getPreferredFlowId(flows, type);

  useEffect(() => {
    if (isEdit || assignee || flows.length === 0) return;
    const currentFlowExists = flowId ? flows.some(flow => flow.id === flowId) : false;
    if (!currentFlowExists && preferredFlowId) {
      setFlowId(preferredFlowId);
      return;
    }
    if (!flowId && preferredFlowId) {
      setFlowId(preferredFlowId);
    }
  }, [assignee, flowId, flows, isEdit, preferredFlowId]);
  const [multiagent, setMultiagent] = useState(editTask?.multiagent || 'auto');
  const [autoContinue, setAutoContinue] = useState(editTask?.auto_continue ?? true);
  const [priority, setPriority] = useState(editTask?.priority || 'backlog');
  const [chaining, setChaining] = useState(editTask?.chaining || 'none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const {
    images,
    dragOver,
    fileInputRef,
    setDragOver,
    handleImageDrop,
    handleImagePaste,
    handleFileSelect,
    removeImage,
  } = useTaskImages({
    initialImages: editTask?.images,
    onError: setError,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError('');
    setLoading(true);
    try {
      const resolvedType = isCustomType ? customType.trim().toLowerCase().replace(/\s+/g, '-') : type;
      if (isCustomType && customType.trim() && onSaveCustomType) {
        await onSaveCustomType(resolvedType, customPipeline);
      }
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type: resolvedType,
        mode,
        effort: mode === 'human' ? 'low' : effort,
        multiagent: mode === 'human' ? 'auto' : multiagent,
        assignee: assignee || null,
        flow_id: flowId || null,
        auto_continue: autoContinue,
        images,
        workstream_id: workstreamId || null,
        priority,
        chaining,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEdit ? 'Failed to save task' : 'Failed to create task'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        className={`${s.modal} ${s.modalBody} ${dragOver ? s.modalDragOver : ''}`}
        onClick={e => e.stopPropagation()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={e => { handleImageDrop(e); setDragOver(false); }}
      >
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
              <TaskAttachmentsEditor taskId={editTask.id} />
            </div>
          )}

          {error && <div className={s.error}>{error}</div>}

          <div className={s.actions}>
            <button className="btn btnPrimary" type="submit" disabled={loading || !title.trim() || (isCustomType && !customType.trim())}>
              {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save' : 'Create')}
            </button>
            <button className="btn btnSecondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
