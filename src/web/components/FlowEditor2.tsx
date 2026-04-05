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
    name: '', position, instructions: '', model: 'sonnet',
    tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
    context_sources: ['claude_md', 'task_description'],
    is_gate: false, on_fail_jump_to: null, max_retries: 1,
    on_max_retries: 'pause', include_agents_md: true,
  };
}

function stepsPayload(steps: FlowStep[]) {
  return steps.map((st, i) => ({
    name: st.name.trim() || `Step ${i + 1}`, position: i + 1,
    instructions: st.instructions, model: st.model, tools: st.tools,
    context_sources: st.context_sources, is_gate: st.is_gate,
    on_fail_jump_to: st.is_gate ? st.on_fail_jump_to : null,
    max_retries: st.is_gate ? st.max_retries : 0,
    on_max_retries: st.is_gate ? st.on_max_retries : 'pause',
    include_agents_md: st.include_agents_md,
  }));
}

function cloneSteps(steps: FlowStep[]): FlowStep[] {
  return steps.map(st => ({ ...st, tools: [...st.tools], context_sources: [...st.context_sources] }));
}

function sortedSteps(flow: Flow): FlowStep[] {
  return cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position));
}

/* ─────────────────────────────────────────────────
   Step edit/create modal — uses TaskForm CSS
   ───────────────────────────────────────────────── */
function StepModal({
  step, idx, allSteps, isNew,
  onUpdate, onToggleTool, onToggleContext, onSave, onDelete, onClose,
}: {
  step: FlowStep; idx: number; allSteps: FlowStep[]; isNew: boolean;
  onUpdate: (patch: Partial<FlowStep>) => void;
  onToggleTool: (tool: string) => void;
  onToggleContext: (src: string) => void;
  onSave: () => void; onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className={formStyles.overlay} onClick={onClose}>
      <div className={formStyles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={formStyles.heading}>{isNew ? 'New step' : (step.name ? `Edit: ${step.name}` : `Edit step ${idx + 1}`)}</h2>
        <form onSubmit={e => e.preventDefault()} className={formStyles.form}>
          <input className={formStyles.input} value={step.name}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder={`Step ${idx + 1}`} autoFocus />

          <div className={formStyles.field}>
            <label className={formStyles.label}>Instructions</label>
            <MdField value={step.instructions}
              onChange={val => onUpdate({ instructions: val })}
              placeholder="What should the AI do in this step..." />
          </div>

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

          <label className={formStyles.checkboxRow}>
            <input type="checkbox" checked={step.is_gate} onChange={e => onUpdate({ is_gate: e.target.checked })} />
            <span>Gate step (pass/fail verdict)</span>
          </label>

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


          <div className={formStyles.actions}>
            <button className="btn btnPrimary" type="button" onClick={onSave}>
              {isNew ? 'Create' : 'Save'}
            </button>
            <button className="btn btnSecondary" type="button" onClick={onClose}>Cancel</button>
            {!isNew && (
              <button className="btn btnDanger btnSm" type="button" style={{ marginLeft: 'auto' }}
                onClick={onDelete}>Delete step</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Modal wrapper — manages local step state, saves on submit
   ───────────────────────────────────────────────── */
function StepModalWrapper({
  flow, stepIdx, onSaveSteps, onClose,
}: {
  flow: Flow; stepIdx: number; // -1 = new step
  onSaveSteps: FlowEditor2Props['onSaveSteps'];
  onClose: () => void;
}) {
  const isNew = stepIdx === -1;
  const sorted = useMemo(() => sortedSteps(flow), [flow.flow_steps]);
  const [steps, setSteps] = useState<FlowStep[]>(() =>
    isNew ? [...sorted, makeBlankStep(sorted.length + 1)] : sorted
  );
  const activeIdx = isNew ? steps.length - 1 : stepIdx;
  const step = steps[activeIdx];

  if (!step) { onClose(); return null; }

  const update = (patch: Partial<FlowStep>) =>
    setSteps(prev => prev.map((s, i) => i === activeIdx ? { ...s, ...patch } : s));
  const toggleTool = (tool: string) =>
    setSteps(prev => prev.map((s, i) => i !== activeIdx ? s :
      { ...s, tools: s.tools.includes(tool) ? s.tools.filter(t => t !== tool) : [...s.tools, tool] }));
  const toggleCtx = (src: string) =>
    setSteps(prev => prev.map((s, i) => i !== activeIdx ? s :
      { ...s, context_sources: s.context_sources.includes(src) ? s.context_sources.filter(c => c !== src) : [...s.context_sources, src] }));

  const handleSave = async () => {
    try { await onSaveSteps(flow.id, stepsPayload(steps)); } catch (err: any) { console.error(err); }
    onClose();
  };
  const handleDelete = async () => {
    const next = steps.filter((_, i) => i !== activeIdx).map((s, i) => ({ ...s, position: i + 1 }));
    try { await onSaveSteps(flow.id, stepsPayload(next)); } catch (err: any) { console.error(err); }
    onClose();
  };

  return (
    <StepModal step={step} idx={activeIdx} allSteps={steps} isNew={isNew}
      onUpdate={update} onToggleTool={toggleTool} onToggleContext={toggleCtx}
      onSave={handleSave} onDelete={handleDelete} onClose={onClose} />
  );
}

/* ─────────────────────────────────────────────────
   FlowColumn — uses WorkstreamColumn + TaskCard CSS
   ───────────────────────────────────────────────── */
function FlowColumn({
  flow, onSave, onSaveSteps, onDeleteFlow, allFlows,
  taskTypes = BUILT_IN_TYPES,
  onOpenStepModal, onColumnDragStart, onColumnDragEnd, onColumnDragOver,
}: {
  flow: Flow;
  onSave: FlowEditor2Props['onSave'];
  onSaveSteps: FlowEditor2Props['onSaveSteps'];
  onDeleteFlow: FlowEditor2Props['onDeleteFlow'];
  allFlows: Flow[];
  taskTypes?: string[];
  onOpenStepModal: (flowId: string, stepIdx: number) => void;
  onColumnDragStart: (flowId: string) => void;
  onColumnDragEnd: () => void;
  onColumnDragOver: (e: React.DragEvent) => void;
}) {
  const steps = useMemo(() => sortedSteps(flow), [flow.flow_steps]);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [editName, setEditName] = useState(flow.name);
  const [editing, setEditing] = useState(false);
  const [agentsMdOpen, setAgentsMdOpen] = useState(!!flow.agents_md);
  const [editAgentsMd, setEditAgentsMd] = useState(flow.agents_md ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync on external changes
  useEffect(() => {
    setEditName(flow.name);
    setEditAgentsMd(flow.agents_md ?? '');
    setAgentsMdOpen(!!flow.agents_md);
    setError('');
  }, [flow.id, flow.name, flow.agents_md]);

  useEffect(() => {
    if (editing && nameInputRef.current) { nameInputRef.current.focus(); nameInputRef.current.select(); }
  }, [editing]);

  // Agents.md dirty
  const agentsMdDirty = editAgentsMd !== (flow.agents_md ?? '');

  // Save agents.md
  const handleSaveAgentsMd = useCallback(async () => {
    setSaving(true); setError('');
    try { await onSave(flow.id, { agents_md: editAgentsMd }); }
    catch (err: any) { setError(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  }, [flow.id, editAgentsMd, onSave]);

  // Step drag reorder
  const handleDragEnd = useCallback(() => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...steps];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      const reordered = next.map((s, i) => ({ ...s, position: i + 1 }));
      onSaveSteps(flow.id, stepsPayload(reordered));
    }
    setDragIdx(null); setDragOverIdx(null);
  }, [dragIdx, dragOverIdx, steps, flow.id, onSaveSteps]);

  // Delete flow
  const handleDeleteFlow = useCallback(async () => {
    if (!confirm(`Delete flow "${flow.name}" and all its steps?`)) return;
    setSaving(true); setError('');
    try { await onDeleteFlow(flow.id); }
    catch (err: any) { setError(err.message || 'Failed to delete'); setSaving(false); }
  }, [flow.id, flow.name, onDeleteFlow]);

  // Rename
  const handleRename = useCallback(async () => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditName(flow.name); }
    else if (trimmed !== flow.name) {
      try { await onSave(flow.id, { name: trimmed }); }
      catch (err: any) { setError(err.message || 'Failed to rename'); setEditName(flow.name); }
    }
    setEditing(false);
  }, [editName, flow.id, flow.name, onSave]);

  return (
    <div className={colStyles.column} onDragOver={onColumnDragOver}>
      {/* Header */}
      <div className={colStyles.headerWrap}>
        <div className={colStyles.header}>
          {editing ? (
            <input ref={nameInputRef} className={colStyles.nameInput}
              value={editName} onChange={e => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditName(flow.name); setEditing(false); } }} />
          ) : (
            <span className={colStyles.name} draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onColumnDragStart(flow.id); }}
              onDragEnd={onColumnDragEnd}
              onDoubleClick={() => { setEditName(flow.name); setEditing(true); }}
              title="Drag to reorder, double-click to rename"
              style={{ cursor: 'grab' }}
            >{editName || flow.name}</span>
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
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>

          {saving && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>Saving...</span>}

          {agentsMdDirty && (
            <button className={colStyles.runBtn} onClick={handleSaveAgentsMd} disabled={saving}>Save</button>
          )}

          {/* + opens modal in "new step" mode, like tasks */}
          <button className={colStyles.addBtn}
            onClick={() => onOpenStepModal(flow.id, -1)}
            title="Add step">+</button>

          <button className={`${colStyles.actionBtn} ${colStyles.actionBtnDanger}`}
            onClick={handleDeleteFlow} disabled={saving} title="Delete flow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Agents.md collapsible */}
      <div className={s.agentsMdSection}>
        <button className={s.sectionToggle} onClick={() => setAgentsMdOpen(v => !v)} type="button">
          <span className={`${s.sectionArrow} ${agentsMdOpen ? s.sectionArrowOpen : ''}`}>&#9654;</span>
          agents.md
          {editAgentsMd && !agentsMdOpen && <span className={s.sectionHint}>(has content)</span>}
        </button>
        {agentsMdOpen && (
          <div className={s.agentsMdBody}>
            <MdField value={editAgentsMd} onChange={setEditAgentsMd}
              placeholder="Shared instructions for all steps in this flow (markdown)..." />
          </div>
        )}
      </div>

      {/* Step cards */}
      <div className={colStyles.tasks}>
        {steps.length === 0 && <div className={colStyles.empty}>No steps yet</div>}
        {steps.map((step, idx) => {
          const isExpanded = expandedStep === idx;
          return (
            <div key={step.id}
              className={`${taskStyles.card} ${dragIdx === idx ? taskStyles.dragging : ''}`}
              onClick={() => setExpandedStep(isExpanded ? null : idx)}
              onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
            >
              {/* Compact row — always visible, same as TaskCard */}
              <div className={taskStyles.compact}>
                <span className={taskStyles.handle} draggable
                  onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDragIdx(idx); }}
                  onDragEnd={handleDragEnd}
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

              {/* Preview — collapsed, same as TaskCard */}
              {!isExpanded && step.instructions && (
                <div className={taskStyles.preview}>
                  <div className={taskStyles.previewDesc}>
                    <Markdown remarkPlugins={[remarkGfm]}>{step.instructions}</Markdown>
                  </div>
                </div>
              )}

              {/* Expanded detail — same as TaskCard IdleDetail */}
              {isExpanded && (
                <div className={taskStyles.detail} onClick={e => e.stopPropagation()}>
                  {step.instructions && (
                    <div className={taskStyles.desc}>
                      <Markdown remarkPlugins={[remarkGfm]}>{step.instructions}</Markdown>
                    </div>
                  )}
                  <div className={taskStyles.meta}>
                    <span>model: {step.model}</span>
                    <span>tools: {step.tools.join(', ')}</span>
                    {step.is_gate && <span>gate step</span>}
                  </div>
                  <div className={taskStyles.actions}>
                    <div className={taskStyles.actionsLeft} />
                    <div className={taskStyles.actionsRight}>
                      <button className="btn btnGhost btnSm"
                        onClick={() => onOpenStepModal(flow.id, idx)}>Edit</button>
                      <button className="btn btnGhost btnSm" style={{ color: 'var(--red)' }}
                        onClick={async () => {
                          const next = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 }));
                          await onSaveSteps(flow.id, stepsPayload(next));
                          setExpandedStep(null);
                        }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   FlowEditor2 — Board container
   ───────────────────────────────────────────────── */
export function FlowEditor2({ flows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, projectId, taskTypes }: FlowEditor2Props) {
  const [creating, setCreating] = useState(false);

  // Column reorder (client-side)
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  useEffect(() => {
    setColumnOrder(prev => {
      const ids = new Set(flows.map(f => f.id));
      const kept = prev.filter(id => ids.has(id));
      const added = flows.map(f => f.id).filter(id => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [flows]);

  const orderedFlows = useMemo(() => {
    const map = new Map(flows.map(f => [f.id, f]));
    return columnOrder.map(id => map.get(id)).filter(Boolean) as Flow[];
  }, [flows, columnOrder]);

  const handleColumnDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    if (!draggedColId || draggedColId === targetId) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    setColumnOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(draggedColId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, draggedColId);
      return next;
    });
  }, [draggedColId]);

  // Modal state at board level (not clipped by column overflow: hidden)
  const [modalTarget, setModalTarget] = useState<{ flowId: string; stepIdx: number } | null>(null);
  const modalFlow = modalTarget ? flows.find(f => f.id === modalTarget.flowId) : null;

  const handleNewFlow = useCallback(async () => {
    setCreating(true);
    try { await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] }); }
    catch (err: any) { console.error('Failed to create flow:', err); }
    finally { setCreating(false); }
  }, [projectId, onCreateFlow]);

  return (
    <div className={boardStyles.board}>
      {orderedFlows.map(flow => (
        <FlowColumn key={flow.id} flow={flow} onSave={onSave} onSaveSteps={onSaveSteps}
          onDeleteFlow={onDeleteFlow} allFlows={flows}
          taskTypes={taskTypes?.length ? taskTypes : BUILT_IN_TYPES}
          onOpenStepModal={(flowId, stepIdx) => setModalTarget({ flowId, stepIdx })}
          onColumnDragStart={setDraggedColId}
          onColumnDragEnd={() => setDraggedColId(null)}
          onColumnDragOver={e => handleColumnDragOver(e, flow.id)}
        />
      ))}

      <button className={boardStyles.addColumn} onClick={handleNewFlow} disabled={creating}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {creating ? 'Creating...' : 'Add flow'}
      </button>

      {/* Step modal at board level — backdrop not clipped */}
      {modalTarget && modalFlow && (
        <StepModalWrapper flow={modalFlow} stepIdx={modalTarget.stepIdx}
          onSaveSteps={onSaveSteps} onClose={() => setModalTarget(null)} />
      )}
    </div>
  );
}
