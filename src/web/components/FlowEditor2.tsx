import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Flow, FlowStep } from '../lib/api';
import { MdField } from './MdField';
import { BUILT_IN_TYPES, ALL_TOOLS, ALL_CONTEXT_SOURCES, MODEL_OPTIONS, ON_MAX_RETRIES_OPTIONS } from '../lib/constants';
import boardStyles from './Board.module.css';
import colStyles from './WorkstreamColumn.module.css';
import taskStyles from './TaskCard.module.css';
import formStyles from './TaskForm.module.css';
import s from './FlowEditor2.module.css';

interface FlowEditor2Props {
  flows: Flow[];
  onSave: (flowId: string, updates: { name?: string; description?: string; agents_md?: string; default_types?: string[] }) => Promise<void>;
  onSaveSteps: (flowId: string, steps: any[]) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: any[] }) => Promise<Flow>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  projectId: string;
  taskTypes?: string[];
}

function makeBlankStep(position: number): FlowStep {
  return {
    id: `new-${Date.now()}-${position}`,
    name: '',
    position,
    instructions: '',
    model: 'sonnet',
    tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
    context_sources: ['claude_md', 'task_description'],
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 1,
    on_max_retries: 'pause',
    include_agents_md: true,
  };
}

function cloneSteps(steps: FlowStep[]): FlowStep[] {
  return steps.map(st => ({ ...st, tools: [...st.tools], context_sources: [...st.context_sources] }));
}

/* ─── Step edit modal — uses TaskForm CSS ─── */
function StepModal({
  step, idx, allSteps, onUpdate, onToggleTool, onToggleContext, onDelete, onClose,
}: {
  step: FlowStep; idx: number; allSteps: FlowStep[];
  onUpdate: (patch: Partial<FlowStep>) => void;
  onToggleTool: (tool: string) => void;
  onToggleContext: (src: string) => void;
  onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className={formStyles.overlay} onClick={onClose}>
      <div className={formStyles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={formStyles.heading}>{step.name ? `Edit: ${step.name}` : `Edit step ${idx + 1}`}</h2>
        <form onSubmit={e => e.preventDefault()} className={formStyles.form}>
          {/* Name */}
          <input
            className={formStyles.input}
            value={step.name}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder={`Step ${idx + 1}`}
            autoFocus
          />

          {/* Instructions */}
          <div className={formStyles.field}>
            <label className={formStyles.label}>Instructions</label>
            <MdField
              value={step.instructions}
              onChange={val => onUpdate({ instructions: val })}
              placeholder="What should the AI do in this step..."
            />
          </div>

          {/* Model */}
          <div className={formStyles.field}>
            <label className={formStyles.label}>Model</label>
            <div className={formStyles.segmented}>
              {MODEL_OPTIONS.map(m => (
                <button key={m} type="button"
                  className={`${formStyles.segmentedBtn} ${step.model === m ? formStyles.segmentedActive : ''}`}
                  onClick={() => onUpdate({ model: m })}
                >{m.charAt(0).toUpperCase() + m.slice(1)}</button>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div className={formStyles.field}>
            <label className={formStyles.label}>Tools</label>
            <div className={s.checkboxGrid}>
              {ALL_TOOLS.map(tool => (
                <label key={tool} className={s.checkboxLabel}>
                  <input type="checkbox" checked={step.tools.includes(tool)} onChange={() => onToggleTool(tool)} />
                  {tool}
                </label>
              ))}
            </div>
          </div>

          {/* Context Sources */}
          <div className={formStyles.field}>
            <label className={formStyles.label}>Context Sources</label>
            <div className={s.chipGrid}>
              {ALL_CONTEXT_SOURCES.map(src => (
                <button key={src} type="button"
                  className={`${s.chip} ${step.context_sources.includes(src) ? s.chipActive : ''}`}
                  onClick={() => onToggleContext(src)}
                >{src}</button>
              ))}
            </div>
          </div>

          {/* Gate toggle */}
          <label className={formStyles.checkboxRow}>
            <input type="checkbox" checked={step.is_gate} onChange={e => onUpdate({ is_gate: e.target.checked })} />
            <span>Gate step (pass/fail verdict)</span>
          </label>

          {/* Gate config */}
          {step.is_gate && (
            <div className={s.gateSection}>
              <div className={s.gateRow}>
                <div className={formStyles.field}>
                  <label className={formStyles.label}>On fail jump to</label>
                  <select className={formStyles.select} value={step.on_fail_jump_to ?? ''}
                    onChange={e => { const v = e.target.value; onUpdate({ on_fail_jump_to: v === '' ? null : Number(v) }); }}>
                    <option value="">None</option>
                    {allSteps.map((_, i) => i !== idx && (
                      <option key={i} value={i + 1}>Step {i + 1}{allSteps[i].name ? ` - ${allSteps[i].name}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className={formStyles.field}>
                  <label className={formStyles.label}>Max retries</label>
                  <input className={formStyles.input} type="number" min={0} max={10}
                    value={step.max_retries} onChange={e => onUpdate({ max_retries: Number(e.target.value) || 0 })} />
                </div>
                <div className={formStyles.field}>
                  <label className={formStyles.label}>On max retries</label>
                  <select className={formStyles.select} value={step.on_max_retries}
                    onChange={e => onUpdate({ on_max_retries: e.target.value })}>
                    {ON_MAX_RETRIES_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Include agents.md */}
          <label className={formStyles.checkboxRow}>
            <input type="checkbox" checked={step.include_agents_md} onChange={e => onUpdate({ include_agents_md: e.target.checked })} />
            <span>Include agents.md context</span>
          </label>

          {/* Actions */}
          <div className={formStyles.actions}>
            <button className="btn btnPrimary" type="button" onClick={onClose}>Done</button>
            <button className="btn btnDanger btnSm" type="button" onClick={onDelete}>Delete step</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Per-column state ─── */
function useColumnState(flow: Flow) {
  const [editName, setEditName] = useState(flow.name);
  const [editAgentsMd, setEditAgentsMd] = useState(flow.agents_md ?? '');
  const [editSteps, setEditSteps] = useState<FlowStep[]>(cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position)));
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null);
  const [agentsMdOpen, setAgentsMdOpen] = useState(!!flow.agents_md);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    setEditName(flow.name);
    setEditAgentsMd(flow.agents_md ?? '');
    setEditSteps(cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position)));
    setAgentsMdOpen(!!flow.agents_md);
    setError('');
  }, [flow.id, flow.name, flow.agents_md, flow.flow_steps]);

  return {
    editName, setEditName, editAgentsMd, setEditAgentsMd,
    editSteps, setEditSteps, editingStepIdx, setEditingStepIdx,
    agentsMdOpen, setAgentsMdOpen, saving, setSaving,
    error, setError, editing, setEditing,
    dragIdx, setDragIdx, dragOverIdx, setDragOverIdx,
  };
}

/* ─── FlowColumn — uses WorkstreamColumn + TaskCard CSS ─── */
function FlowColumn({
  flow, onSave, onSaveSteps, onDeleteFlow, allFlows, taskTypes = BUILT_IN_TYPES,
}: {
  flow: Flow;
  onSave: FlowEditor2Props['onSave'];
  onSaveSteps: FlowEditor2Props['onSaveSteps'];
  onDeleteFlow: FlowEditor2Props['onDeleteFlow'];
  allFlows: Flow[];
  taskTypes?: string[];
}) {
  const st = useColumnState(flow);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (st.editing && nameInputRef.current) { nameInputRef.current.focus(); nameInputRef.current.select(); }
  }, [st.editing]);

  // Step mutations
  const updateStep = useCallback((idx: number, patch: Partial<FlowStep>) => {
    st.setEditSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }, [st.setEditSteps]);

  const toggleTool = useCallback((idx: number, tool: string) => {
    st.setEditSteps(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      return { ...s, tools: s.tools.includes(tool) ? s.tools.filter(t => t !== tool) : [...s.tools, tool] };
    }));
  }, [st.setEditSteps]);

  const toggleContext = useCallback((idx: number, src: string) => {
    st.setEditSteps(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      return { ...s, context_sources: s.context_sources.includes(src) ? s.context_sources.filter(c => c !== src) : [...s.context_sources, src] };
    }));
  }, [st.setEditSteps]);

  const addStep = useCallback(() => {
    const newIdx = st.editSteps.length;
    st.setEditSteps(prev => [...prev, makeBlankStep(prev.length + 1)]);
    st.setEditingStepIdx(newIdx);
  }, [st.editSteps.length, st.setEditSteps, st.setEditingStepIdx]);

  const deleteStep = useCallback((idx: number) => {
    st.setEditSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 })));
    st.setEditingStepIdx(null);
  }, [st.setEditSteps, st.setEditingStepIdx]);

  // Step drag reorder
  const handleDragStart = useCallback((idx: number) => st.setDragIdx(idx), [st.setDragIdx]);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); st.setDragOverIdx(idx); }, [st.setDragOverIdx]);
  const handleDragEnd = useCallback(() => {
    if (st.dragIdx !== null && st.dragOverIdx !== null && st.dragIdx !== st.dragOverIdx) {
      st.setEditSteps(prev => {
        const next = [...prev];
        const [moved] = next.splice(st.dragIdx!, 1);
        next.splice(st.dragOverIdx!, 0, moved);
        return next.map((s, i) => ({ ...s, position: i + 1 }));
      });
    }
    st.setDragIdx(null); st.setDragOverIdx(null);
  }, [st.dragIdx, st.dragOverIdx, st.setEditSteps, st.setDragIdx, st.setDragOverIdx]);

  // Dirty detection
  const isDirty = useMemo(() => {
    if (st.editName !== flow.name) return true;
    if (st.editAgentsMd !== (flow.agents_md ?? '')) return true;
    const orig = flow.flow_steps.slice().sort((a, b) => a.position - b.position);
    if (st.editSteps.length !== orig.length) return true;
    for (let i = 0; i < st.editSteps.length; i++) {
      const e = st.editSteps[i], o = orig[i];
      if (!o) return true;
      if (e.name !== o.name || e.instructions !== o.instructions || e.model !== o.model
        || e.is_gate !== o.is_gate || e.max_retries !== o.max_retries
        || e.on_max_retries !== o.on_max_retries || e.on_fail_jump_to !== o.on_fail_jump_to
        || JSON.stringify(e.tools) !== JSON.stringify(o.tools)
        || JSON.stringify(e.context_sources) !== JSON.stringify(o.context_sources)) return true;
    }
    return false;
  }, [st.editName, st.editAgentsMd, st.editSteps, flow]);

  // Save
  const handleSave = useCallback(async () => {
    st.setSaving(true); st.setError('');
    try {
      await onSave(flow.id, { name: st.editName.trim() || flow.name, agents_md: st.editAgentsMd });
      await onSaveSteps(flow.id, st.editSteps.map((s, i) => ({
        name: s.name.trim() || `Step ${i + 1}`, position: i + 1,
        instructions: s.instructions, model: s.model, tools: s.tools,
        context_sources: s.context_sources, is_gate: s.is_gate,
        on_fail_jump_to: s.is_gate ? s.on_fail_jump_to : null,
        max_retries: s.is_gate ? s.max_retries : 0,
        on_max_retries: s.is_gate ? s.on_max_retries : 'pause',
        include_agents_md: s.include_agents_md,
      })));
    } catch (err: any) { st.setError(err.message || 'Failed to save flow'); }
    finally { st.setSaving(false); }
  }, [flow.id, flow.name, st.editName, st.editAgentsMd, st.editSteps, onSave, onSaveSteps]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete flow "${flow.name}" and all its steps?`)) return;
    st.setSaving(true); st.setError('');
    try { await onDeleteFlow(flow.id); }
    catch (err: any) { st.setError(err.message || 'Failed to delete'); st.setSaving(false); }
  }, [flow.id, flow.name, onDeleteFlow]);

  // Rename
  const handleRename = useCallback(async () => {
    const trimmed = st.editName.trim();
    if (!trimmed) { st.setEditName(flow.name); }
    else if (trimmed !== flow.name) {
      try { await onSave(flow.id, { name: trimmed }); }
      catch (err: any) { st.setError(err.message || 'Failed to rename'); st.setEditName(flow.name); }
    }
    st.setEditing(false);
  }, [st.editName, flow.id, flow.name, onSave]);

  return (
    <div className={colStyles.column}>
      {/* Header — reuses WorkstreamColumn header */}
      <div className={colStyles.headerWrap}>
        <div className={colStyles.header}>
          {st.editing ? (
            <input ref={nameInputRef} className={colStyles.nameInput}
              value={st.editName} onChange={e => st.setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { st.setEditName(flow.name); st.setEditing(false); } }} />
          ) : (
            <span className={colStyles.name}
              onDoubleClick={() => { st.setEditName(flow.name); st.setEditing(true); }}
              title="Double-click to rename"
            >{st.editName || flow.name}</span>
          )}

          <select className={s.typeSelect} value=""
            onChange={e => {
              const type = e.target.value; if (!type) return;
              const cur = flow.default_types || [];
              onSave(flow.id, { default_types: cur.includes(type) ? cur.filter(t => t !== type) : [...cur, type] });
            }}
            title="Default task types for this flow">
            <option value="">{(flow.default_types || []).length > 0 ? (flow.default_types || []).join(', ') : 'types'}</option>
            {taskTypes.map(t => {
              const other = allFlows.some(f => f.id !== flow.id && (f.default_types || []).includes(t));
              const owned = (flow.default_types || []).includes(t);
              return <option key={t} value={t} disabled={other}>{owned ? '\u2713 ' : ''}{t}{other ? ' (other flow)' : ''}</option>;
            })}
          </select>

          <span className={colStyles.taskCount}>
            {st.editSteps.length} {st.editSteps.length === 1 ? 'step' : 'steps'}
          </span>

          {st.saving && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>Saving...</span>}

          {isDirty && (
            <button className={colStyles.runBtn} onClick={handleSave} disabled={st.saving}>Save</button>
          )}

          <button className={colStyles.addBtn} onClick={addStep} title="Add step">+</button>

          <button className={`${colStyles.actionBtn} ${colStyles.actionBtnDanger}`}
            onClick={handleDelete} disabled={st.saving} title="Delete flow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Agents.md collapsible */}
      <div className={s.agentsMdSection}>
        <button className={s.sectionToggle} onClick={() => st.setAgentsMdOpen(v => !v)} type="button">
          <span className={`${s.sectionArrow} ${st.agentsMdOpen ? s.sectionArrowOpen : ''}`}>&#9654;</span>
          agents.md
          {st.editAgentsMd && !st.agentsMdOpen && <span className={s.sectionHint}>(has content)</span>}
        </button>
        {st.agentsMdOpen && (
          <div className={s.agentsMdBody}>
            <MdField value={st.editAgentsMd} onChange={val => st.setEditAgentsMd(val)}
              placeholder="Shared instructions for all steps in this flow (markdown)..." />
          </div>
        )}
      </div>

      {/* Step cards — uses TaskCard CSS */}
      <div className={colStyles.tasks}>
        {st.editSteps.length === 0 && <div className={colStyles.empty}>No steps yet</div>}
        {st.editSteps.map((step, idx) => (
          <div key={step.id}
            className={`${taskStyles.card} ${st.dragIdx === idx ? taskStyles.dragging : ''}`}
            onClick={() => st.setEditingStepIdx(idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
          >
            <div className={taskStyles.compact}>
              <span className={taskStyles.handle} draggable
                onDragStart={e => { e.stopPropagation(); handleDragStart(idx); }}
                onClick={e => e.stopPropagation()}
                title="Drag to reorder"
              >&#8942;&#8942;</span>
              <span className={taskStyles.title}>{step.name || `Step ${idx + 1}`}</span>
              <div className={taskStyles.tags}>
                <span className={`${taskStyles.tag} ${step.model === 'opus' ? s.modelOpus : s.modelSonnet}`}>
                  {step.model}
                </span>
                {step.is_gate && <span className={`${taskStyles.tag} ${taskStyles.tagType}`}>gate</span>}
              </div>
            </div>
            {step.instructions && (
              <div className={taskStyles.preview}>
                <div className={taskStyles.previewDesc}>
                  <Markdown remarkPlugins={[remarkGfm]}>{step.instructions}</Markdown>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {st.error && <div className={s.error}>{st.error}</div>}

      {/* Step edit modal */}
      {st.editingStepIdx !== null && st.editSteps[st.editingStepIdx] && (
        <StepModal
          step={st.editSteps[st.editingStepIdx]}
          idx={st.editingStepIdx}
          allSteps={st.editSteps}
          onUpdate={patch => updateStep(st.editingStepIdx!, patch)}
          onToggleTool={tool => toggleTool(st.editingStepIdx!, tool)}
          onToggleContext={src => toggleContext(st.editingStepIdx!, src)}
          onDelete={() => deleteStep(st.editingStepIdx!)}
          onClose={() => st.setEditingStepIdx(null)}
        />
      )}
    </div>
  );
}

/* ─── FlowEditor2: Board container — uses Board CSS ─── */
export function FlowEditor2({ flows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, projectId, taskTypes }: FlowEditor2Props) {
  const [creating, setCreating] = useState(false);

  const handleNewFlow = useCallback(async () => {
    setCreating(true);
    try { await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] }); }
    catch (err: any) { console.error('Failed to create flow:', err); }
    finally { setCreating(false); }
  }, [projectId, onCreateFlow]);

  return (
    <div className={boardStyles.board}>
      {flows.map(flow => (
        <FlowColumn key={flow.id} flow={flow} onSave={onSave} onSaveSteps={onSaveSteps}
          onDeleteFlow={onDeleteFlow} allFlows={flows}
          taskTypes={taskTypes?.length ? taskTypes : BUILT_IN_TYPES} />
      ))}
      <button className={boardStyles.addColumn} onClick={handleNewFlow} disabled={creating}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {creating ? 'Creating...' : 'Add flow'}
      </button>
    </div>
  );
}
