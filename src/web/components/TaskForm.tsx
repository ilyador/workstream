import { useState, useEffect } from 'react';
import type { CustomTaskType, Flow, MemberRecord, WorkstreamRecord } from '../lib/api';
import { TaskDescriptionField } from './TaskDescriptionField';
import { TaskImagesSection } from './TaskImagesSection';
import { TaskAttachmentsEditor } from './TaskAttachmentsEditor';
import { useTaskImages } from '../hooks/useTaskImages';
import s from './TaskForm.module.css';

type WorkstreamOption = Pick<WorkstreamRecord, 'id' | 'name'>;
type MemberOption = Pick<MemberRecord, 'id' | 'name' | 'initials'>;
type CustomTypeOption = Pick<CustomTaskType, 'id' | 'name' | 'pipeline'>;

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

import { BUILT_IN_TYPES } from '../lib/constants';

const PIPELINE_OPTIONS = [
  { value: 'feature', label: 'feature (plan → implement → verify → review)' },
  { value: 'bug-fix', label: 'bug-fix (plan → analyze → fix → verify → review)' },
  { value: 'refactor', label: 'refactor (plan → analyze → refactor → verify → review)' },
  { value: 'test', label: 'test (plan → write-tests → verify → review)' },
];

function getPreferredFlowId(flows: Flow[], taskType: string): string {
  return flows.find(flow => (flow.default_types || []).includes(taskType))?.id || flows[0]?.id || '';
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
          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label}>Type</label>
              {isCustomType ? (
                <div className={s.customTypeRow}>
                  <input
                    className={s.input}
                    placeholder="e.g. docs, spike, deploy"
                    value={customType}
                    onChange={e => setCustomType(e.target.value)}
                    autoFocus
                  />
                  <select
                    className={s.select}
                    value={customPipeline}
                    onChange={e => setCustomPipeline(e.target.value)}
                    aria-label="Custom type pipeline"
                  >
                    {PIPELINE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={s.customTypeCancel}
                    onClick={() => { setIsCustomType(false); setCustomType(''); }}
                    title="Use preset type"
                  >&times;</button>
                </div>
              ) : (
                <select aria-label="Type" className={s.select} value={type} onChange={e => {
                  if (e.target.value === '__custom__') {
                    setCustomPipeline(
                      PIPELINE_OPTIONS.some(option => option.value === type) ? type : 'feature'
                    );
                    setIsCustomType(true);
                  } else {
                    const nextType = e.target.value;
                    setType(nextType);
                    const matchingFlowId = getPreferredFlowId(flows, nextType);
                    if (matchingFlowId) {
                      setFlowId(matchingFlowId);
                    }
                    setAssignee('');
                    setMode('ai');
                  }
                }}>
                  {BUILT_IN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  {customTypes.filter(ct => !BUILT_IN_TYPES.includes(ct.name)).map(ct => (
                    <option key={ct.id} value={ct.name}>{ct.name}</option>
                  ))}
                  <option value="__custom__">custom...</option>
                </select>
              )}
            </div>
            <div className={s.field}>
              <label className={s.label}>Assignee</label>
              <select aria-label="Assignee" className={s.select} value={assignee ? `human:${assignee}` : (flowId ? `flow:${flowId}` : '')} onChange={e => {
                const val = e.target.value;
                if (val.startsWith('flow:')) {
                  setFlowId(val.slice(5));
                  setAssignee('');
                  setMode('ai');
                } else if (val.startsWith('human:')) {
                  setAssignee(val.slice(6));
                  setFlowId('');
                  setMode('human');
                  setAutoContinue(false);
                } else {
                  setAssignee('');
                  setFlowId('');
                  setMode('ai');
                }
              }}>
                {flows.length > 0 && (
                  <optgroup label="AI Flows">
                    {flows.map(f => <option key={f.id} value={`flow:${f.id}`}>{f.name}</option>)}
                  </optgroup>
                )}
                {flows.length === 0 && <option value="">AI</option>}
                {members.length > 0 && (
                  <optgroup label="Team">
                    {members.map(m => <option key={m.id} value={`human:${m.id}`}>{m.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            {!assignee && (
              <div className={s.field}>
                <label className={s.label}>Effort</label>
                <select className={s.select} value={effort} onChange={e => setEffort(e.target.value)}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="max">max</option>
                </select>
              </div>
            )}
          </div>
          <div className={s.row}>
            {workstreams.length > 0 && (
              <div className={s.field}>
                <label className={s.label}>Workstream</label>
                <select className={s.select} value={workstreamId} onChange={e => setWorkstreamId(e.target.value)}>
                  <option value="">Backlog</option>
                  {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
            {!workstreamId && (
              <div className={s.field}>
                <label className={s.label}>Priority</label>
                <div className={s.segmented}>
                  {(['critical', 'upcoming', 'backlog'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`${s.segmentedBtn} ${priority === p ? s.segmentedActive : ''}`}
                      onClick={() => setPriority(p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={s.checkboxes}>
            {!assignee && (
              <label className={s.checkboxRow}>
                <input
                  type="checkbox"
                  checked={multiagent === 'yes'}
                  onChange={e => setMultiagent(e.target.checked ? 'yes' : 'auto')}
                />
                <span>Use subagents</span>
              </label>
            )}
            {!assignee && (
              <label className={s.checkboxRow}>
                <input
                  type="checkbox"
                  checked={autoContinue}
                  onChange={e => setAutoContinue(e.target.checked)}
                />
                <span>Continue automatically</span>
              </label>
            )}
          </div>

          <div className={s.field}>
            <label className={s.label}>File chaining</label>
            <select className={s.select} value={chaining} onChange={e => setChaining(e.target.value)}>
              <option value="none">None</option>
              <option value="accept">Accept files from previous task</option>
              <option value="produce">Produce files for next task</option>
              <option value="both">Accept and produce files</option>
            </select>
          </div>

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
