import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import type { Flow, FlowStep } from '../lib/api';
import s from './FlowEditor.module.css';

/** Markdown field: shows rendered preview, switches to textarea on click. */
function MdField({ value, onChange, placeholder, autoResizeFn }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoResizeFn?: (el: HTMLTextAreaElement) => void;
}) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      if (autoResizeFn) autoResizeFn(taRef.current);
    }
  }, [editing, autoResizeFn]);

  if (editing) {
    return (
      <textarea
        ref={taRef}
        className={s.textarea}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          if (autoResizeFn) autoResizeFn(e.target);
        }}
        onBlur={() => setEditing(false)}
        placeholder={placeholder}
      />
    );
  }

  if (!value) {
    return (
      <div className={s.mdPreviewEmpty} onClick={() => setEditing(true)}>
        {placeholder || 'Click to edit...'}
      </div>
    );
  }

  return (
    <div className={s.mdPreview} onClick={() => setEditing(true)}>
      <Markdown>{value}</Markdown>
    </div>
  );
}

interface FlowEditorProps {
  flows: Flow[];
  onSave: (flowId: string, updates: { name?: string; description?: string; agents_md?: string }) => Promise<void>;
  onSaveSteps: (flowId: string, steps: any[]) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: any[] }) => Promise<Flow>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  projectId: string;
}

const ALL_TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'];
const ALL_CONTEXT_SOURCES = [
  'claude_md', 'task_description', 'task_images',
  'skills', 'architecture_md', 'review_criteria', 'followup_notes', 'git_diff', 'rag',
];
const MODEL_OPTIONS = ['opus', 'sonnet'];
const ON_MAX_RETRIES_OPTIONS = ['pause', 'fail', 'skip'];

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
  return steps.map(st => ({
    ...st,
    tools: [...st.tools],
    context_sources: [...st.context_sources],
  }));
}

/* ─── Per-column state hook ─── */
function useFlowColumnState(flow: Flow) {
  const [editName, setEditName] = useState(flow.name);
  const [editAgentsMd, setEditAgentsMd] = useState(flow.agents_md ?? '');
  const [editSteps, setEditSteps] = useState<FlowStep[]>(
    cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position))
  );
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [agentsMdOpen, setAgentsMdOpen] = useState(!!flow.agents_md);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Sync when flow data changes externally
  useEffect(() => {
    setEditName(flow.name);
    setEditAgentsMd(flow.agents_md ?? '');
    setEditSteps(cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position)));
    setAgentsMdOpen(!!flow.agents_md);
    setError('');
  }, [flow.id, flow.name, flow.agents_md, flow.flow_steps]);

  return {
    editName, setEditName,
    editAgentsMd, setEditAgentsMd,
    editSteps, setEditSteps,
    expandedStep, setExpandedStep,
    agentsMdOpen, setAgentsMdOpen,
    saving, setSaving,
    error, setError,
    editing, setEditing,
    dragIdx, setDragIdx,
    dragOverIdx, setDragOverIdx,
  };
}

/* ─── FlowColumn: one flow rendered as a WorkstreamColumn-style column ─── */
function FlowColumn({
  flow,
  onSave,
  onSaveSteps,
  onDeleteFlow,
}: {
  flow: Flow;
  onSave: FlowEditorProps['onSave'];
  onSaveSteps: FlowEditorProps['onSaveSteps'];
  onDeleteFlow: FlowEditorProps['onDeleteFlow'];
}) {
  const state = useFlowColumnState(flow);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when editing
  useEffect(() => {
    if (state.editing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [state.editing]);

  // ---- Step mutations ----
  const updateStep = useCallback((idx: number, patch: Partial<FlowStep>) => {
    state.setEditSteps(prev => prev.map((st, i) => i === idx ? { ...st, ...patch } : st));
  }, [state.setEditSteps]);

  const toggleTool = useCallback((idx: number, tool: string) => {
    state.setEditSteps(prev => prev.map((st, i) => {
      if (i !== idx) return st;
      const has = st.tools.includes(tool);
      return { ...st, tools: has ? st.tools.filter(t => t !== tool) : [...st.tools, tool] };
    }));
  }, [state.setEditSteps]);

  const toggleContextSource = useCallback((idx: number, src: string) => {
    state.setEditSteps(prev => prev.map((st, i) => {
      if (i !== idx) return st;
      const has = st.context_sources.includes(src);
      return { ...st, context_sources: has ? st.context_sources.filter(c => c !== src) : [...st.context_sources, src] };
    }));
  }, [state.setEditSteps]);

  const addStep = useCallback(() => {
    state.setEditSteps(prev => [...prev, makeBlankStep(prev.length + 1)]);
    state.setExpandedStep(state.editSteps.length);
  }, [state.editSteps.length, state.setEditSteps, state.setExpandedStep]);

  const deleteStep = useCallback((idx: number) => {
    state.setEditSteps(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((st, i) => ({ ...st, position: i + 1 }));
    });
    state.setExpandedStep(null);
  }, [state.setEditSteps, state.setExpandedStep]);

  // ---- Drag reorder ----
  const handleDragStart = useCallback((idx: number) => {
    state.setDragIdx(idx);
  }, [state.setDragIdx]);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    state.setDragOverIdx(idx);
  }, [state.setDragOverIdx]);

  const handleDragEnd = useCallback(() => {
    if (state.dragIdx !== null && state.dragOverIdx !== null && state.dragIdx !== state.dragOverIdx) {
      state.setEditSteps(prev => {
        const next = [...prev];
        const [moved] = next.splice(state.dragIdx!, 1);
        next.splice(state.dragOverIdx!, 0, moved);
        return next.map((st, i) => ({ ...st, position: i + 1 }));
      });
    }
    state.setDragIdx(null);
    state.setDragOverIdx(null);
  }, [state.dragIdx, state.dragOverIdx, state.setEditSteps, state.setDragIdx, state.setDragOverIdx]);

  // ---- Dirty detection ----
  const isDirty = useMemo(() => {
    if (state.editName !== flow.name) return true;
    if (state.editAgentsMd !== (flow.agents_md ?? '')) return true;
    const origSteps = flow.flow_steps.slice().sort((a, b) => a.position - b.position);
    if (state.editSteps.length !== origSteps.length) return true;
    for (let i = 0; i < state.editSteps.length; i++) {
      const e = state.editSteps[i], o = origSteps[i];
      if (!o) return true;
      if (e.name !== o.name || e.instructions !== o.instructions || e.model !== o.model
        || e.is_gate !== o.is_gate || e.max_retries !== o.max_retries
        || e.on_max_retries !== o.on_max_retries
        || e.on_fail_jump_to !== o.on_fail_jump_to
        || JSON.stringify(e.tools) !== JSON.stringify(o.tools)
        || JSON.stringify(e.context_sources) !== JSON.stringify(o.context_sources)) return true;
    }
    return false;
  }, [state.editName, state.editAgentsMd, state.editSteps, flow]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    state.setSaving(true);
    state.setError('');
    try {
      await onSave(flow.id, {
        name: state.editName.trim() || flow.name,
        agents_md: state.editAgentsMd,
      });
      const stepsPayload = state.editSteps.map((st, i) => ({
        name: st.name.trim() || `Step ${i + 1}`,
        position: i + 1,
        instructions: st.instructions,
        model: st.model,
        tools: st.tools,
        context_sources: st.context_sources,
        is_gate: st.is_gate,
        on_fail_jump_to: st.is_gate ? st.on_fail_jump_to : null,
        max_retries: st.is_gate ? st.max_retries : 0,
        on_max_retries: st.is_gate ? st.on_max_retries : 'pause',
        include_agents_md: st.include_agents_md,
      }));
      await onSaveSteps(flow.id, stepsPayload);
    } catch (err: any) {
      state.setError(err.message || 'Failed to save flow');
    } finally {
      state.setSaving(false);
    }
  }, [flow.id, flow.name, state.editName, state.editAgentsMd, state.editSteps, onSave, onSaveSteps, state.setSaving, state.setError]);

  // ---- Delete flow ----
  const handleDeleteFlow = useCallback(async () => {
    if (!confirm(`Delete flow "${flow.name}" and all its steps? This cannot be undone.`)) return;
    state.setSaving(true);
    state.setError('');
    try {
      await onDeleteFlow(flow.id);
    } catch (err: any) {
      state.setError(err.message || 'Failed to delete flow');
      state.setSaving(false);
    }
  }, [flow.id, flow.name, flow.is_builtin, onDeleteFlow, state.setSaving, state.setError]);

  // ---- Rename ----
  const handleRename = useCallback(async () => {
    const trimmed = state.editName.trim();
    if (!trimmed) {
      state.setEditName(flow.name);
    } else if (trimmed !== flow.name) {
      try {
        await onSave(flow.id, { name: trimmed });
      } catch (err: any) {
        state.setError(err.message || 'Failed to rename');
        state.setEditName(flow.name);
      }
    }
    state.setEditing(false);
  }, [state.editName, flow.id, flow.name, state.setEditName, state.setEditing, state.setError, onSave]);

  // ---- Auto-resize textarea helper ----
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  }, []);

  return (
    <div className={s.column}>
      {/* Header */}
      <div className={s.headerWrap}>
        <div className={s.header}>
          {state.editing ? (
            <input
              ref={nameInputRef}
              className={s.nameInput}
              value={state.editName}
              onChange={e => state.setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  state.setEditName(flow.name);
                  state.setEditing(false);
                }
              }}
            />
          ) : (
            <span
              className={s.name}
              onDoubleClick={() => {
                state.setEditName(flow.name);
                state.setEditing(true);
              }}
              title="Double-click to rename"
            >
              {state.editName || flow.name}
            </span>
          )}

          <span className={s.stepCount}>
            {state.editSteps.length} {state.editSteps.length === 1 ? 'step' : 'steps'}
          </span>

          {state.saving && <span className={s.savingText}>Saving...</span>}

          {isDirty && (
            <button
              className={s.saveBtn}
              onClick={handleSave}
              disabled={state.saving}
              title="Save flow"
            >
              Save
            </button>
          )}

          <button
            className={`${s.actionBtn} ${s.actionBtnDanger}`}
            onClick={handleDeleteFlow}
            disabled={state.saving}
            title="Delete flow"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Agents.md collapsible section */}
      <div className={s.agentsMdSection}>
        <button
          className={s.sectionToggle}
          onClick={() => state.setAgentsMdOpen(v => !v)}
          type="button"
        >
          <span className={`${s.sectionArrow} ${state.agentsMdOpen ? s.sectionArrowOpen : ''}`}>&#9654;</span>
          agents.md
          {state.editAgentsMd && !state.agentsMdOpen && (
            <span className={s.sectionHint}>(has content)</span>
          )}
        </button>
        {state.agentsMdOpen && (
          <div className={s.agentsMdBody}>
            <MdField
              value={state.editAgentsMd}
              onChange={val => state.setEditAgentsMd(val)}
              placeholder="Shared instructions for all steps in this flow (markdown)..."
              autoResizeFn={autoResize}
            />
          </div>
        )}
      </div>

      {/* Step cards */}
      <div className={s.steps}>
        {state.editSteps.length === 0 && (
          <div className={s.empty}>No steps yet</div>
        )}
        {state.editSteps.map((step, idx) => {
          const isExpanded = state.expandedStep === idx;
          return (
            <div
              key={step.id}
              className={`${s.stepCard} ${state.dragIdx === idx ? s.stepCardDragging : ''} ${state.dragOverIdx === idx && state.dragIdx !== idx ? s.stepCardDragOver : ''}`}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
            >
              {/* Compact row */}
              <div
                className={s.stepCompact}
                onClick={() => state.setExpandedStep(isExpanded ? null : idx)}
              >
                <span
                  className={s.dragHandle}
                  draggable
                  onDragStart={e => { e.stopPropagation(); handleDragStart(idx); }}
                  onClick={e => e.stopPropagation()}
                  title="Drag to reorder"
                >&#8942;&#8942;</span>
                <span className={s.stepName}>{step.name || `Step ${idx + 1}`}</span>
                <span className={`${s.modelBadge} ${step.model === 'opus' ? s.modelOpus : s.modelSonnet}`}>
                  {step.model}
                </span>
                {step.is_gate && <span className={s.gateIcon} title="Gate step">&#9878;</span>}
                <span className={`${s.stepExpandIcon} ${isExpanded ? s.stepExpandIconOpen : ''}`}>&#9654;</span>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className={s.stepBody}>
                  {/* Name */}
                  <div className={s.field}>
                    <label className={s.label}>Name</label>
                    <input
                      className={s.input}
                      value={step.name}
                      onChange={e => updateStep(idx, { name: e.target.value })}
                      placeholder={`Step ${idx + 1}`}
                    />
                  </div>

                  {/* Instructions */}
                  <div className={s.field}>
                    <label className={s.label}>Instructions</label>
                    <MdField
                      value={step.instructions}
                      onChange={val => updateStep(idx, { instructions: val })}
                      placeholder="What should the AI do in this step..."
                      autoResizeFn={autoResize}
                    />
                  </div>

                  {/* Model */}
                  <div className={s.field}>
                    <label className={s.label}>Model</label>
                    <div className={s.segmented}>
                      {MODEL_OPTIONS.map(m => (
                        <button
                          key={m}
                          type="button"
                          className={`${s.segmentedBtn} ${step.model === m ? s.segmentedActive : ''}`}
                          onClick={() => updateStep(idx, { model: m })}
                        >
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tools */}
                  <div className={s.field}>
                    <label className={s.label}>Tools</label>
                    <div className={s.checkboxGrid}>
                      {ALL_TOOLS.map(tool => (
                        <label key={tool} className={s.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={step.tools.includes(tool)}
                            onChange={() => toggleTool(idx, tool)}
                          />
                          {tool}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Context Sources */}
                  <div className={s.field}>
                    <label className={s.label}>Context Sources</label>
                    <div className={s.chipGrid}>
                      {ALL_CONTEXT_SOURCES.map(src => (
                        <button
                          key={src}
                          type="button"
                          className={`${s.chip} ${step.context_sources.includes(src) ? s.chipActive : ''}`}
                          onClick={() => toggleContextSource(idx, src)}
                        >
                          {src}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gate toggle */}
                  <div className={s.row}>
                    <label className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={step.is_gate}
                        onChange={e => updateStep(idx, { is_gate: e.target.checked })}
                      />
                      Gate step (pass/fail verdict)
                    </label>
                  </div>

                  {/* Gate config */}
                  {step.is_gate && (
                    <div className={s.gateSection}>
                      <div className={s.gateRow}>
                        <div className={s.field}>
                          <label className={s.label}>On fail jump to</label>
                          <select
                            className={s.select}
                            value={step.on_fail_jump_to ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              updateStep(idx, { on_fail_jump_to: v === '' ? null : Number(v) });
                            }}
                          >
                            <option value="">None</option>
                            {state.editSteps.map((_, i) => (
                              i !== idx && <option key={i} value={i + 1}>Step {i + 1}{state.editSteps[i].name ? ` - ${state.editSteps[i].name}` : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div className={s.field}>
                          <label className={s.label}>Max retries</label>
                          <input
                            className={s.input}
                            type="number"
                            min={0}
                            max={10}
                            value={step.max_retries}
                            onChange={e => updateStep(idx, { max_retries: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <div className={s.field}>
                          <label className={s.label}>On max retries</label>
                          <select
                            className={s.select}
                            value={step.on_max_retries}
                            onChange={e => updateStep(idx, { on_max_retries: e.target.value })}
                          >
                            {ON_MAX_RETRIES_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Delete step */}
                  <div className={s.deleteStepRow}>
                    <button
                      className="btn btnDanger btnSm"
                      type="button"
                      onClick={() => deleteStep(idx)}
                    >
                      Delete step
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add step button */}
      <div className={s.addStepWrap}>
        <button className={s.addStepBtn} type="button" onClick={addStep}>
          + Add Step
        </button>
      </div>

      {/* Error */}
      {state.error && <div className={s.error}>{state.error}</div>}
    </div>
  );
}

/* ─── FlowEditor: Board container ─── */
export function FlowEditor({ flows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, projectId }: FlowEditorProps) {
  const [creating, setCreating] = useState(false);

  const handleNewFlow = useCallback(async () => {
    setCreating(true);
    try {
      await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] });
    } catch (err: any) {
      console.error('Failed to create flow:', err);
    } finally {
      setCreating(false);
    }
  }, [projectId, onCreateFlow]);

  return (
    <div className={s.board}>
      {flows.map(flow => (
        <FlowColumn
          key={flow.id}
          flow={flow}
          onSave={onSave}
          onSaveSteps={onSaveSteps}
          onDeleteFlow={onDeleteFlow}
        />
      ))}

      {/* Add flow button */}
      <button className={s.addColumn} onClick={handleNewFlow} disabled={creating}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {creating ? 'Creating...' : 'Add flow'}
      </button>
    </div>
  );
}
