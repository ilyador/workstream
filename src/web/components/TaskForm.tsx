import { useState, useRef, useEffect, useCallback } from 'react';
import { getSkills, type SkillInfo } from '../lib/api';
import s from './TaskForm.module.css';

interface Milestone {
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
  blocked_by: string[];
  images: string[];
  milestone_id: string | null;
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
  blocked_by?: string[];
  images?: string[];
  milestone_id?: string | null;
}

interface Props {
  milestones: Milestone[];
  members: Member[];
  existingTasks: TaskOption[];
  customTypes?: CustomType[];
  onSaveCustomType?: (name: string, pipeline: string) => Promise<void>;
  localPath?: string;
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

export function TaskForm({ milestones, members, existingTasks, customTypes = [], onSaveCustomType, localPath, editTask, onSubmit, onClose }: Props) {
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
  const [effort, setEffort] = useState(editTask?.effort || 'high');
  const [milestoneId, setMilestoneId] = useState(editTask?.milestone_id || '');
  const [assignee, setAssignee] = useState(editTask?.assignee || '');
  const [multiagent, setMultiagent] = useState(editTask?.multiagent || 'auto');
  const [blockedBy, setBlockedBy] = useState<string[]>(editTask?.blocked_by || []);
  const [imageUrls, setImageUrls] = useState(editTask?.images?.join(', ') || '');
  const [showMore, setShowMore] = useState(isEdit);
  const [blockerSearch, setBlockerSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Skill autocomplete state
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const [selectedSkillIdx, setSelectedSkillIdx] = useState(0);
  const [slashStart, setSlashStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  }, []);

  const insertSkill = useCallback((skillName: string) => {
    if (slashStart < 0) return;
    const before = description.substring(0, slashStart);
    const cursor = textareaRef.current?.selectionStart ?? (slashStart + skillFilter.length + 1);
    const after = description.substring(cursor);
    const newDesc = before + '/' + skillName + ' ' + after;
    setDescription(newDesc);
    setShowSkills(false);
    // Restore focus and cursor
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const pos = before.length + skillName.length + 2; // +2 for / and space
        ta.selectionStart = ta.selectionEnd = pos;
      }
    });
  }, [description, slashStart, skillFilter]);

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
      const images = imageUrls
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);
      const resolvedType = isCustomType ? customType.trim().toLowerCase().replace(/\s+/g, '-') : type;
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type: resolvedType,
        mode,
        effort,
        multiagent,
        assignee: assignee || null,
        blocked_by: blockedBy,
        images,
        milestone_id: milestoneId || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || (isEdit ? 'Failed to save task' : 'Failed to create task'));
    } finally {
      setLoading(false);
    }
  }

  function toggleBlocker(taskId: string) {
    setBlockedBy(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  }

  const filteredTasks = existingTasks.filter(t =>
    t.title.toLowerCase().includes(blockerSearch.toLowerCase())
  );

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
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
              rows={3}
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
              <label className={s.label}>Mode</label>
              <select className={s.select} value={mode} onChange={e => setMode(e.target.value)}>
                <option value="ai">AI</option>
                <option value="human">Human</option>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Effort</label>
              <select className={s.select} value={effort} onChange={e => setEffort(e.target.value)}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="max">max</option>
              </select>
            </div>
          </div>
          <div className={s.row}>
            {milestones.length > 0 && (
              <div className={s.field}>
                <label className={s.label}>Milestone</label>
                <select className={s.select} value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
                  <option value="">None</option>
                  {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            <div className={s.field}>
              <label className={s.label}>Assignee</label>
              <select className={s.select} value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">AI (default)</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="btn btnGhost"
            onClick={() => setShowMore(!showMore)}
            style={{ alignSelf: 'flex-start', padding: '0' }}
          >
            {showMore ? '- Less options' : '+ More options'}
          </button>

          {showMore && (
            <div className={s.moreSection}>
              <label className={s.checkboxRow}>
                <input
                  type="checkbox"
                  checked={multiagent === 'yes'}
                  onChange={e => setMultiagent(e.target.checked ? 'yes' : 'auto')}
                />
                <span>Use subagents</span>
              </label>

              <div className={s.field}>
                <label className={s.label}>Blocked by</label>
                {existingTasks.length > 0 ? (
                  <div className={s.blockerBox}>
                    {existingTasks.length > 5 && (
                      <input
                        className={s.blockerSearch}
                        placeholder="Search tasks..."
                        value={blockerSearch}
                        onChange={e => setBlockerSearch(e.target.value)}
                      />
                    )}
                    <div className={s.blockerList}>
                      {filteredTasks.map(t => (
                        <label key={t.id} className={s.blockerItem}>
                          <input
                            type="checkbox"
                            checked={blockedBy.includes(t.id)}
                            onChange={() => toggleBlocker(t.id)}
                          />
                          <span className={s.blockerTitle}>{t.title}</span>
                        </label>
                      ))}
                      {filteredTasks.length === 0 && (
                        <span className={s.blockerEmpty}>No matching tasks</span>
                      )}
                    </div>
                    {blockedBy.length > 0 && (
                      <div className={s.blockerCount}>
                        {blockedBy.length} task{blockedBy.length !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                ) : (
                  <span className={s.noItems}>No other tasks yet</span>
                )}
              </div>

              <div className={s.field}>
                <label className={s.label}>Image URLs</label>
                <input
                  className={s.input}
                  placeholder="Comma-separated URLs"
                  value={imageUrls}
                  onChange={e => setImageUrls(e.target.value)}
                />
                <span className={s.hint}>Screenshots, designs, error captures. Full upload coming soon.</span>
              </div>
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
