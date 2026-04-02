import { useState, useRef, useEffect, useCallback } from 'react';
import { getSkills, type SkillInfo } from '../lib/api';
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
  auto_continue: boolean;
  images: string[];
  workstream_id: string | null;
  priority: string;
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
  auto_continue?: boolean;
  images?: string[];
  workstream_id?: string | null;
  priority?: string;
}

interface Props {
  workstreams: Workstream[];
  members: Member[];
  existingTasks: TaskOption[];
  customTypes?: CustomType[];
  onSaveCustomType?: (name: string, pipeline: string) => Promise<void>;
  localPath?: string;
  defaultWorkstreamId?: string | null;
  editTask?: EditTaskData;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onClose: () => void;
}

const BUILT_IN_TYPES = ['feature', 'bug-fix', 'ui-fix', 'refactor', 'test', 'design', 'chore'];

const PIPELINE_OPTIONS = [
  { value: 'feature', label: 'feature (plan → implement → verify → review)' },
  { value: 'bug-fix', label: 'bug-fix (plan → analyze → fix → verify → review)' },
  { value: 'refactor', label: 'refactor (plan → analyze → refactor → verify → review)' },
  { value: 'test', label: 'test (plan → write-tests → verify → review)' },
];

export function TaskForm({ workstreams, members, existingTasks, customTypes = [], onSaveCustomType, localPath, defaultWorkstreamId, editTask, onSubmit, onClose }: Props) {
  const isEdit = !!editTask;

  // Determine if the editTask type is a custom (non-built-in) type
  const editTypeIsCustom = isEdit && !BUILT_IN_TYPES.includes(editTask!.type);

  const [title, setTitle] = useState(editTask?.title || '');
  const [description, setDescription] = useState(editTask?.description || '');
  const [type, setType] = useState(editTypeIsCustom ? 'feature' : (editTask?.type || 'feature'));
  const [customType, setCustomType] = useState(editTypeIsCustom ? editTask!.type : '');
  const [customPipeline, setCustomPipeline] = useState('feature');
  const [isCustomType, setIsCustomType] = useState(editTypeIsCustom);
  const [mode, setMode] = useState(editTask?.mode || 'ai');
  const [effort, setEffort] = useState(editTask?.effort || 'max');
  const [workstreamId, setWorkstreamId] = useState(editTask?.workstream_id || defaultWorkstreamId || '');
  const [assignee, setAssignee] = useState(editTask?.assignee || '');
  const [multiagent, setMultiagent] = useState(editTask?.multiagent || 'auto');
  const [autoContinue, setAutoContinue] = useState(editTask?.auto_continue ?? true);
  const [priority, setPriority] = useState(editTask?.priority || 'backlog');
  const [images, setImages] = useState<string[]>(editTask?.images || []);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Skill autocomplete state
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const [selectedSkillIdx, setSelectedSkillIdx] = useState(0);
  const [slashStart, setSlashStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content, capped at 300px
  const autoResizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 300) + 'px';
  }, []);

  // Auto-resize on mount when editing a task with existing description
  useEffect(() => {
    if (editTask?.description) {
      autoResizeTextarea();
    }
  }, [editTask?.description, autoResizeTextarea]);

  // Fetch skills on mount
  useEffect(() => {
    getSkills(localPath).then(setSkills).catch(() => {});
  }, [localPath]);

  const filteredSkills = skills.filter(sk =>
    sk.name.toLowerCase().includes(skillFilter.toLowerCase())
  );

  // Validate skill references in the description
  const skillNames = new Set(skills.map(sk => sk.name));
  const referencedSkills = description
    ? [...description.matchAll(/(?:^|[\s\n])\/([a-zA-Z0-9_][\w:-]*)/g)].map(m => m[1])
    : [];
  const invalidSkills = referencedSkills.filter(name => !skillNames.has(name));
  const validSkills = referencedSkills.filter(name => skillNames.has(name));

  // Detect `/` trigger in textarea
  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setDescription(val);
    autoResizeTextarea();

    // Find the `/` that triggers autocomplete: must be at start of line or after whitespace
    const textBefore = val.substring(0, cursor);
    const slashMatch = textBefore.match(/(?:^|[\s\n])\/([a-zA-Z0-9_:-]*)$/);
    if (slashMatch) {
      const matchStart = textBefore.lastIndexOf('/' + slashMatch[1]);
      setSlashStart(matchStart);
      setSkillFilter(slashMatch[1]);
      setShowSkills(true);
      setSelectedSkillIdx(0);
    } else {
      setShowSkills(false);
    }
  }, [autoResizeTextarea]);

  const insertSkill = useCallback((skillName: string) => {
    if (slashStart < 0) return;
    const before = description.substring(0, slashStart);
    const cursor = textareaRef.current?.selectionStart ?? (slashStart + skillFilter.length + 1);
    const after = description.substring(cursor);
    const newDesc = before + '/' + skillName + ' ' + after;
    setDescription(newDesc);
    setShowSkills(false);
    // Restore focus and cursor, then resize
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const pos = before.length + skillName.length + 2; // +2 for / and space
        ta.selectionStart = ta.selectionEnd = pos;
      }
      autoResizeTextarea();
    });
  }, [description, slashStart, skillFilter, autoResizeTextarea]);

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
    if (!showSkills || filteredSkills.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSkillIdx(i => Math.min(i + 1, filteredSkills.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSkillIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertSkill(filteredSkills[selectedSkillIdx].name);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSkills(false);
    }
  }, [showSkills, filteredSkills, selectedSkillIdx, insertSkill]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError('');
    setLoading(true);
    try {
      const resolvedType = isCustomType ? customType.trim().toLowerCase().replace(/\s+/g, '-') : type;
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type: resolvedType,
        mode,
        effort,
        multiagent,
        assignee: assignee || null,
        auto_continue: autoContinue,
        images,
        workstream_id: workstreamId || null,
        priority,
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
        className={`${s.modal} ${dragOver ? s.modalDragOver : ''}`}
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
            <textarea
              ref={textareaRef}
              className={s.textarea}
              placeholder="Description (optional) — type / to insert a skill"
              value={description}
              onChange={handleDescriptionChange}
              onKeyDown={handleDescriptionKeyDown}
              onBlur={() => { setTimeout(() => setShowSkills(false), 150); }}
              onPaste={e => {
                const hasImage = Array.from(e.clipboardData.items).some(i => i.type.startsWith('image/'));
                if (hasImage) {
                  e.preventDefault();
                  handleImagePaste(e);
                }
              }}
            />
            {showSkills && filteredSkills.length > 0 && (
              <div className={s.skillDropdown}>
                {filteredSkills.map((sk, i) => (
                  <div
                    key={sk.name}
                    className={`${s.skillItem} ${i === selectedSkillIdx ? s.skillItemActive : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); insertSkill(sk.name); }}
                    onMouseEnter={() => setSelectedSkillIdx(i)}
                  >
                    <span className={s.skillName}>/{sk.name}</span>
                    {sk.description && <span className={s.skillDesc}>{sk.description}</span>}
                    <span className={s.skillSource}>{sk.source}</span>
                  </div>
                ))}
              </div>
            )}
            {referencedSkills.length > 0 && !showSkills && (
              <div className={s.skillBadges}>
                {validSkills.map(name => (
                  <span key={name} className={s.skillBadgeValid}>/{name}</span>
                ))}
                {invalidSkills.map(name => (
                  <span key={name} className={s.skillBadgeInvalid} title="Skill not found — will be ignored">/{name}</span>
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
                  }
                }}>
                  {BUILT_IN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">custom...</option>
                </select>
              )}
            </div>
            <div className={s.field}>
              <label className={s.label}>Assignee</label>
              <select className={s.select} value={assignee} onChange={e => {
                const val = e.target.value;
                setAssignee(val);
                setMode(val ? 'human' : 'ai');
                if (val) setAutoContinue(false);
              }}>
                <option value="">AI</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
            <label className={s.checkboxRow}>
              <input
                type="checkbox"
                checked={autoContinue}
                onChange={e => setAutoContinue(e.target.checked)}
                disabled={!!assignee}
              />
              <span>Continue automatically</span>
            </label>
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
