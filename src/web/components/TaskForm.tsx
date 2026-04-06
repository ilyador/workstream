import { useState, useRef, useEffect, useCallback } from 'react';
import { getSkills, type SkillInfo, type Flow } from '../lib/api';
import { MdField } from './MdField';
import mdStyles from './MdField.module.css';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { computeSkillInsert } from '../lib/skill-insert';
import { useArtifacts } from '../hooks/useArtifacts';
import { getFileIcon, formatFileSize } from '../lib/file-utils';
import s from './TaskForm.module.css';

interface Workstream {
  id: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  initials: string;
}

interface TaskOption {
  id: string;
  title: string;
}

interface CustomType {
  id: string;
  name: string;
  pipeline: string;
}

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
  workstreams: Workstream[];
  members: Member[];
  existingTasks: TaskOption[];
  flows?: Flow[];
  customTypes?: CustomType[];
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

export function TaskForm({ workstreams, members, existingTasks, flows = [], customTypes = [], onSaveCustomType, localPath, defaultWorkstreamId, editTask, onSubmit, onClose }: Props) {
  const isEdit = !!editTask;

  // Determine if the editTask type is a custom (non-built-in) type
  const editTypeIsCustom = isEdit && !BUILT_IN_TYPES.includes(editTask!.type);
  // Check if the custom type is already saved (known custom type vs truly new)
  const editTypeIsSavedCustom = editTypeIsCustom && customTypes.some(ct => ct.name === editTask!.type);

  const [title, setTitle] = useState(editTask?.title || '');
  const [description, setDescription] = useState(editTask?.description || '');
  const [type, setType] = useState(editTypeIsSavedCustom ? editTask!.type : (editTypeIsCustom ? 'feature' : (editTask?.type || 'feature')));
  const [customType, setCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom ? editTask!.type : '');
  const [customPipeline, setCustomPipeline] = useState('feature');
  const [isCustomType, setIsCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom);
  const [mode, setMode] = useState(editTask?.mode || 'ai');
  const [effort, setEffort] = useState(editTask?.effort || 'max');
  const [workstreamId, setWorkstreamId] = useState(editTask?.workstream_id || defaultWorkstreamId || '');
  const [assignee, setAssignee] = useState(editTask?.assignee || '');
  const [flowId, setFlowId] = useState(isEdit ? (editTask?.flow_id ?? '') : (
    flows.find(f => (f.default_types || []).includes('feature'))?.id || (flows.length > 0 ? flows[0].id : '')
  ));
  // When flows load after mount (new task), sync flowId with current type
  useEffect(() => {
    if (isEdit || flows.length === 0) return;
    if (!flowId) {
      const match = flows.find(f => (f.default_types || []).includes(type));
      if (match) setFlowId(match.id);
    }
  }, [flows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [multiagent, setMultiagent] = useState(editTask?.multiagent || 'auto');
  const [autoContinue, setAutoContinue] = useState(editTask?.auto_continue ?? true);
  const [priority, setPriority] = useState(editTask?.priority || 'backlog');
  const [chaining, setChaining] = useState(editTask?.chaining || 'none');
  const [images, setImages] = useState<string[]>(editTask?.images || []);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Skill autocomplete state
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashCommands(skills);

  // Fetch skills on mount
  useEffect(() => {
    getSkills(localPath).then(data => {
      setSkills(data);
      setSkillsLoaded(true);
    }).catch(() => {
      setSkillsLoaded(true);
    });
  }, [localPath]);

  // Validate skill references in the description (AI mode only)
  const skillNames = new Set(skills.map(sk => sk.name));
  const referencedSkills = mode === 'ai' && description
    ? [...description.matchAll(/(?:^|[\s\n])\/([a-zA-Z0-9_][\w:-]*)/g)].map(m => m[1])
    : [];
  const invalidSkills = referencedSkills.filter(name => !skillNames.has(name));
  const validSkills = referencedSkills.filter(name => skillNames.has(name));

  // Detect `/` trigger in textarea
  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setDescription(val);
    // Auto-resize textarea to fit content
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
    if (mode === 'ai') {
      slash.handleTextChange(val, cursor);
    }
  }, [mode, slash]);

  const insertSkill = useCallback((skillName: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = computeSkillInsert(description, ta.selectionStart, skillName);
    if (!result) return;
    setDescription(result.newText);
    slash.dismiss();
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = result.newCursor;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  }, [description, slash]);

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  function handleImageDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`Image too large (max 5MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleImagePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'));
    for (const item of items) {
      const file = item.getAsFile();
      if (file) {
        if (file.size > MAX_IMAGE_SIZE) {
          setError(`Image too large (max 5MB)`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => setImages(prev => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`Image too large (max 5MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  }

  function removeImage(index: number) {
    setImages(prev => prev.filter((_, i) => i !== index));
  }

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === 'ai') {
      slash.handleKeyDown(e, insertSkill);
    }
  }, [mode, slash, insertSkill]);

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
    } catch (err: any) {
      setError(err.message || (isEdit ? 'Failed to save task' : 'Failed to create task'));
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
          <div className={s.descriptionWrap}>
            <MdField
              value={description}
              onChange={setDescription}
              placeholder={mode === 'ai' ? "Description (optional) -- type / to insert a skill" : "Description (optional)"}
              minHeight={72}
              renderTextarea={(stopEditing) => (
                <textarea
                  ref={el => {
                    (textareaRef as any).current = el;
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                  }}
                  className={mdStyles.textarea}
                  placeholder={mode === 'ai' ? "Description (optional) -- type / to insert a skill" : "Description (optional)"}
                  value={description}
                  onChange={handleDescriptionChange}
                  onKeyDown={handleDescriptionKeyDown}
                  onBlur={(e) => {
                    // Don't switch to preview if clicking a button -- layout shift steals the click
                    const related = e.relatedTarget as HTMLElement | null;
                    if (!related?.tagName?.match(/^BUTTON$/i) && !related?.closest('button')) {
                      stopEditing();
                    }
                    setTimeout(() => slash.dismiss(), 150);
                  }}
                  onPaste={e => {
                    const hasImage = Array.from(e.clipboardData.items).some(i => i.type.startsWith('image/'));
                    if (hasImage) {
                      e.preventDefault();
                      handleImagePaste(e);
                    }
                  }}
                  autoFocus
                />
              )}
            />
            {mode === 'ai' && slash.matches.length > 0 && (
              <div className={s.skillDropdown}>
                {slash.matches.map((sk, i) => (
                  <div
                    key={sk.name}
                    className={`${s.skillItem} ${i === slash.selectedIdx ? s.skillItemActive : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); insertSkill(sk.name); }}
                    onMouseEnter={() => {/* selection handled by hook */}}
                  >
                    <span className={s.skillName}>/{sk.name}</span>
                    {sk.description && <span className={s.skillDesc}>{sk.description}</span>}
                    <span className={s.skillSource}>{sk.source}</span>
                  </div>
                ))}
              </div>
            )}
            {mode === 'ai' && referencedSkills.length > 0 && slash.matches.length === 0 && skillsLoaded && (
              <div className={s.skillBadges}>
                {validSkills.map(name => (
                  <span key={name} className={s.skillBadgeValid}>/{name}</span>
                ))}
                {invalidSkills.map(name => (
                  <span key={name} className={s.skillBadgeInvalid} title="Skill not found - will be ignored">/{name}</span>
                ))}
              </div>
            )}
          </div>
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
                  <button
                    type="button"
                    className={s.customTypeCancel}
                    onClick={() => { setIsCustomType(false); setCustomType(''); }}
                    title="Use preset type"
                  >&times;</button>
                </div>
              ) : (
                <select className={s.select} value={type} onChange={e => {
                  if (e.target.value === '__custom__') {
                    setIsCustomType(true);
                  } else {
                    setType(e.target.value);
                    // Auto-select flow if one is linked to this type
                    const matchingFlow = flows.find(f => (f.default_types || []).includes(e.target.value));
                    if (matchingFlow) {
                      setFlowId(matchingFlow.id);
                      setAssignee('');
                      setMode('ai');
                    }
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
              <select className={s.select} value={assignee ? `human:${assignee}` : (flowId ? `flow:${flowId}` : '')} onChange={e => {
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

          <div className={s.imagesSection}>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileSelect} />
            {images.length > 0 && (
              <div className={s.imageGrid}>
                {images.map((url, i) => (
                  <div key={i} className={s.imageThumb}>
                    <img src={url} alt="" />
                    <button type="button" className={s.imageRemove} onClick={() => removeImage(i)}>&times;</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn btnGhost btnSm" onClick={() => fileInputRef.current?.click()}>
              + Add images
            </button>
            {dragOver && <div className={s.dragHint}>Drop images anywhere on this form</div>}
          </div>

          {isEdit && editTask?.id && (
            <div>
              <label className={s.label}>Attachments</label>
              {(chaining === 'produce' || chaining === 'both') && (
                <div style={{ padding: '8px 12px', marginBottom: 8, background: 'var(--amber-bg)', borderLeft: '3px solid var(--amber)', borderRadius: 6, fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>
                  This task requires a file attachment before it can be completed
                </div>
              )}
              <TaskAttachmentsEdit taskId={editTask.id} />
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

/** Inline attachments editor for the edit modal */
function TaskAttachmentsEdit({ taskId }: { taskId: string }) {
  const { artifacts, upload, remove } = useArtifacts(taskId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) upload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files || [])) upload(file);
    e.target.value = '';
  };


  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>
          {artifacts.length > 0 ? `${artifacts.length} file${artifacts.length > 1 ? 's' : ''}` : ''}
        </span>
        <button
          type="button"
          className="btn btnGhost btnSm"
          onClick={() => fileInputRef.current?.click()}
        >+ Add</button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />
      </div>
      {artifacts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {artifacts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
              border: '1px solid var(--divider)', borderRadius: 6, background: 'var(--white)',
            }}>
              {a.mime_type.startsWith('image/') ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  <img src={a.url} alt={a.filename} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                </a>
              ) : (
                <span style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{getFileIcon(a.mime_type)}</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--text)', textDecoration: 'none',
                  display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.filename}</a>
                {a.size_bytes > 0 && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{formatFileSize(a.size_bytes)}</span>}
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                title="Remove"
                style={{
                  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', color: 'var(--text-4)', fontSize: 14, cursor: 'pointer',
                  borderRadius: 4,
                }}
              >&times;</button>
            </div>
          ))}
        </div>
      ) : (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{
            border: '2px dashed var(--divider)', borderRadius: 8, padding: 16,
            textAlign: 'center', fontSize: 12, color: 'var(--text-4)',
          }}
        >
          Drop files here or click + Add
        </div>
      )}
      {artifacts.length > 0 && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{ marginTop: 4, padding: '8px 0', textAlign: 'center', fontSize: 11, color: 'var(--text-4)' }}
        >
          Drop more files here
        </div>
      )}
    </div>
  );
}
