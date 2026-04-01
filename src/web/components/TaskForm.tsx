import { useState } from 'react';
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

interface Props {
  milestones: Milestone[];
  members: Member[];
  existingTasks: TaskOption[];
  onSubmit: (data: {
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
  }) => Promise<void>;
  onClose: () => void;
}

const BUILT_IN_TYPES = ['feature', 'bug-fix', 'ui-fix', 'refactor', 'test', 'design', 'chore'];

export function TaskForm({ milestones, members, existingTasks, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('feature');
  const [customType, setCustomType] = useState('');
  const [isCustomType, setIsCustomType] = useState(false);
  const [mode, setMode] = useState('ai');
  const [effort, setEffort] = useState('high');
  const [milestoneId, setMilestoneId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [multiagent, setMultiagent] = useState('auto');
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [blockerSearch, setBlockerSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError(err.message || 'Failed to create task');
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
        <h2 className={s.heading}>New task</h2>
        <form onSubmit={handleSubmit} className={s.form}>
          <input
            className={s.input}
            placeholder="Task title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            autoFocus
          />
          <textarea
            className={s.textarea}
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
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
            className={s.moreToggle}
            onClick={() => setShowMore(!showMore)}
          >
            {showMore ? '- Less options' : '+ More options'}
          </button>

          {showMore && (
            <div className={s.moreSection}>
              <div className={s.field}>
                <label className={s.label}>Multi-agent</label>
                <select className={s.select} value={multiagent} onChange={e => setMultiagent(e.target.value)}>
                  <option value="auto">auto</option>
                  <option value="yes">yes</option>
                </select>
              </div>

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
            <button className={s.submit} type="submit" disabled={loading || !title.trim() || (isCustomType && !customType.trim())}>
              {loading ? 'Creating...' : 'Create'}
            </button>
            <button className={s.cancel} type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
