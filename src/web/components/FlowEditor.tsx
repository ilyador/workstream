import { useState, useRef, useCallback, useEffect } from 'react';
import type { Flow, FlowStep } from '../lib/api';
import s from './FlowEditor.module.css';

interface FlowEditorProps {
  flows: Flow[];
  onSave: (flowId: string, updates: { name?: string; description?: string; agents_md?: string }) => Promise<void>;
  onSaveSteps: (flowId: string, steps: any[]) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: any[] }) => Promise<void>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  projectId: string;
  onClose: () => void;
}

const ALL_TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'Agent'];
const ALL_CONTEXT_SOURCES = [
  'claude_md', 'agents_md', 'task_description', 'task_images',
  'skills', 'architecture_md', 'review_criteria', 'followup_notes', 'git_diff',
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

export function FlowEditor({ flows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, projectId, onClose }: FlowEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(flows[0]?.id ?? null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAgentsMd, setEditAgentsMd] = useState('');
  const [editSteps, setEditSteps] = useState<FlowStep[]>([]);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [agentsMdOpen, setAgentsMdOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Auto-resize refs for textareas
  const instructionsRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  const selectedFlow = flows.find(f => f.id === selectedId) ?? null;

  // Sync local state when selection changes
  useEffect(() => {
    if (!selectedFlow) {
      setEditName('');
      setEditDesc('');
      setEditAgentsMd('');
      setEditSteps([]);
      setExpandedStep(null);
      return;
    }
    setEditName(selectedFlow.name);
    setEditDesc(selectedFlow.description);
    setEditAgentsMd(selectedFlow.agents_md ?? '');
    setEditSteps(cloneSteps(selectedFlow.flow_steps.sort((a, b) => a.position - b.position)));
    setExpandedStep(null);
    setAgentsMdOpen(!!(selectedFlow.agents_md));
    setError('');
  }, [selectedFlow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Step mutations ----
  const updateStep = useCallback((idx: number, patch: Partial<FlowStep>) => {
    setEditSteps(prev => prev.map((st, i) => i === idx ? { ...st, ...patch } : st));
  }, []);

  const toggleTool = useCallback((idx: number, tool: string) => {
    setEditSteps(prev => prev.map((st, i) => {
      if (i !== idx) return st;
      const has = st.tools.includes(tool);
      return { ...st, tools: has ? st.tools.filter(t => t !== tool) : [...st.tools, tool] };
    }));
  }, []);

  const toggleContextSource = useCallback((idx: number, src: string) => {
    setEditSteps(prev => prev.map((st, i) => {
      if (i !== idx) return st;
      const has = st.context_sources.includes(src);
      return { ...st, context_sources: has ? st.context_sources.filter(c => c !== src) : [...st.context_sources, src] };
    }));
  }, []);

  const addStep = useCallback(() => {
    setEditSteps(prev => {
      const next = [...prev, makeBlankStep(prev.length + 1)];
      return next;
    });
    // Expand the new step
    setExpandedStep(editSteps.length);
  }, [editSteps.length]);

  const deleteStep = useCallback((idx: number) => {
    setEditSteps(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((st, i) => ({ ...st, position: i + 1 }));
    });
    setExpandedStep(null);
  }, []);

  // ---- Drag-and-drop reorder ----
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setEditSteps(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dragOverIdx, 0, moved);
        return next.map((st, i) => ({ ...st, position: i + 1 }));
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, dragOverIdx]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    if (!selectedFlow) return;
    setSaving(true);
    setError('');
    try {
      await onSave(selectedFlow.id, {
        name: editName.trim() || selectedFlow.name,
        description: editDesc.trim(),
        agents_md: editAgentsMd,
      });
      const stepsPayload = editSteps.map((st, i) => ({
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
      await onSaveSteps(selectedFlow.id, stepsPayload);
    } catch (err: any) {
      setError(err.message || 'Failed to save flow');
    } finally {
      setSaving(false);
    }
  }, [selectedFlow, editName, editDesc, editAgentsMd, editSteps, onSave, onSaveSteps]);

  // ---- New flow ----
  const handleNewFlow = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] });
    } catch (err: any) {
      setError(err.message || 'Failed to create flow');
    } finally {
      setSaving(false);
    }
  }, [projectId, onCreateFlow]);

  // ---- Delete flow ----
  const handleDeleteFlow = useCallback(async () => {
    if (!selectedFlow || selectedFlow.is_builtin) return;
    if (!confirm(`Delete flow "${selectedFlow.name}" and all its steps? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    try {
      await onDeleteFlow(selectedFlow.id);
      setSelectedId(flows.find(f => f.id !== selectedFlow.id)?.id ?? null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete flow');
    } finally {
      setSaving(false);
    }
  }, [selectedFlow, flows, onDeleteFlow]);

  // ---- Auto-resize textarea helper ----
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  }, []);

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        {/* ---- Sidebar ---- */}
        <div className={s.sidebar}>
          <div className={s.sidebarHeader}>Flows</div>
          <div className={s.flowList}>
            {flows.map(f => (
              <div
                key={f.id}
                className={`${s.flowItem} ${f.id === selectedId ? s.flowItemActive : ''}`}
                onClick={() => setSelectedId(f.id)}
              >
                <span className={s.flowName}>{f.name}</span>
                <span className={s.stepBadge}>{f.flow_steps.length}</span>
              </div>
            ))}
          </div>
          <div className={s.sidebarFooter}>
            <button
              className="btn btnSecondary btnSm"
              style={{ width: '100%' }}
              onClick={handleNewFlow}
              disabled={saving}
            >
              + New Flow
            </button>
          </div>
        </div>

        {/* ---- Panel ---- */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <div className={s.panelHeaderLeft}>
              {selectedFlow && (
                <input
                  className={`${s.input} ${s.nameInput}`}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Flow name"
                />
              )}
            </div>
            <button className={s.closeBtn} onClick={onClose} title="Close">&times;</button>
          </div>

          <div className={s.panelBody}>
            {!selectedFlow ? (
              <div className={s.emptyState}>
                <div className={s.emptyStateTitle}>No flow selected</div>
                <div>Pick a flow from the sidebar or create a new one.</div>
              </div>
            ) : (
              <>
                {/* Description */}
                <input
                  className={`${s.input} ${s.descInput}`}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                />

                {/* Agent Instructions collapsible */}
                <div className={s.section}>
                  <button
                    className={s.sectionToggle}
                    onClick={() => setAgentsMdOpen(v => !v)}
                    type="button"
                  >
                    <span className={`${s.sectionArrow} ${agentsMdOpen ? s.sectionArrowOpen : ''}`}>&#9654;</span>
                    Agent Instructions
                    {editAgentsMd && !agentsMdOpen && (
                      <span style={{ fontWeight: 400, color: 'var(--text-4)', marginLeft: 4 }}>(has content)</span>
                    )}
                  </button>
                  {agentsMdOpen && (
                    <div className={s.sectionBody}>
                      <textarea
                        className={`${s.textarea} ${s.agentsMdTextarea}`}
                        value={editAgentsMd}
                        onChange={e => setEditAgentsMd(e.target.value)}
                        placeholder="Shared instructions passed to agents running this flow (markdown)..."
                      />
                    </div>
                  )}
                </div>

                {/* Steps */}
                <div className={s.section}>
                  <span className={s.label}>Steps</span>
                </div>

                <div className={s.stepList}>
                  {editSteps.map((step, idx) => {
                    const isExpanded = expandedStep === idx;
                    return (
                      <div
                        key={step.id}
                        className={`${s.stepCard} ${dragIdx === idx ? s.stepCardDragging : ''} ${dragOverIdx === idx && dragIdx !== idx ? s.stepCardDragOver : ''}`}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                      >
                        {/* Collapsed header */}
                        <div
                          className={s.stepHeader}
                          onClick={() => setExpandedStep(isExpanded ? null : idx)}
                        >
                          <span
                            className={s.dragHandle}
                            onClick={e => e.stopPropagation()}
                            title="Drag to reorder"
                          >&#8942;&#8942;</span>
                          <span className={s.stepPosition}>{idx + 1}</span>
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
                              <textarea
                                ref={el => {
                                  if (el) {
                                    instructionsRefs.current.set(idx, el);
                                    autoResize(el);
                                  } else {
                                    instructionsRefs.current.delete(idx);
                                  }
                                }}
                                className={s.textarea}
                                value={step.instructions}
                                onChange={e => {
                                  updateStep(idx, { instructions: e.target.value });
                                  autoResize(e.target);
                                }}
                                placeholder="What should the AI do in this step..."
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

                            {/* Gate toggle + include_agents_md */}
                            <div className={s.row}>
                              <label className={s.checkboxLabel}>
                                <input
                                  type="checkbox"
                                  checked={step.is_gate}
                                  onChange={e => updateStep(idx, { is_gate: e.target.checked })}
                                />
                                Gate step
                              </label>
                              <label className={s.checkboxLabel}>
                                <input
                                  type="checkbox"
                                  checked={step.include_agents_md}
                                  onChange={e => updateStep(idx, { include_agents_md: e.target.checked })}
                                />
                                Include agents_md
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
                                      {editSteps.map((_, i) => (
                                        i !== idx && <option key={i} value={i + 1}>Step {i + 1}{editSteps[i].name ? ` - ${editSteps[i].name}` : ''}</option>
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

                {/* Add step */}
                <div style={{ marginTop: 8 }}>
                  <button className="btn btnGhost btnSm" type="button" onClick={addStep}>
                    + Add Step
                  </button>
                </div>

                {error && <div className={s.error} style={{ marginTop: 12 }}>{error}</div>}
              </>
            )}
          </div>

          {/* Footer */}
          {selectedFlow && (
            <div className={s.panelFooter}>
              <div>
                {!selectedFlow.is_builtin && (
                  <button
                    className="btn btnDanger btnSm"
                    type="button"
                    onClick={handleDeleteFlow}
                    disabled={saving}
                  >
                    Delete Flow
                  </button>
                )}
              </div>
              <div className={s.panelFooterRight}>
                {saving && <span className={s.savingText}>Saving...</span>}
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
