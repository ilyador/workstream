import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Flow, FlowStep } from '../lib/api';
import { MdField } from './MdField';
import { WorkstreamColumn } from './WorkstreamColumn';
import { useBoardDrag } from '../hooks/useBoardDrag';
import { useModal } from '../hooks/modal-context';
import { BUILT_IN_TYPES, ALL_TOOLS, ALL_CONTEXT_SOURCES, MODEL_OPTIONS, ON_MAX_RETRIES_OPTIONS } from '../lib/constants';
import { FlowStepCard } from './FlowStepCard';
import boardStyles from './Board.module.css';
import colStyles from './WorkstreamColumn.module.css';
import formStyles from './TaskForm.module.css';
import s from './FlowEditor2.module.css';

interface FlowEditor2Props {
  flows: Flow[];
  setFlows: React.Dispatch<React.SetStateAction<Flow[]>>;
  onSave: (flowId: string, updates: { name?: string; description?: string; agents_md?: string; default_types?: string[]; position?: number }) => Promise<void>;
  onSaveSteps: (flowId: string, steps: FlowStepInput[]) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: FlowStepInput[] }) => Promise<Flow>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  onSwapColumns: (draggedId: string, targetId: string) => void;
  projectId: string;
  taskTypes?: string[];
}

const EMPTY_JOB_MAP = {};
const EMPTY_SET = new Set<string>();

type FlowStepInput = Omit<FlowStep, 'id'>;

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
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

function stepsPayload(steps: FlowStep[]): FlowStepInput[] {
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
  return cloneSteps(flow.flow_steps.slice().sort((a, b) => a.position - b.position));
}

/** Map a flow step to a task-shaped object for TaskCard */
function stepToTask(step: FlowStep, idx: number) {
  return {
    id: step.id,
    title: step.name || `Step ${idx + 1}`,
    description: step.instructions || undefined,
    type: step.model,
    mode: 'ai' as const,
    effort: '',
    auto_continue: true,
    status: 'backlog' as const,
  };
}

/** Map a flow to a workstream-shaped object for WorkstreamColumn */
function flowToWorkstream(flow: Flow) {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description || '',
    has_code: false,
    status: 'open',
    position: flow.position ?? 0,
  };
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
      <div className={`${formStyles.modal} ${formStyles.modalBody}`} onClick={e => e.stopPropagation()}>
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
  const modal = useModal();
  const sorted = sortedSteps(flow);
  const [steps, setSteps] = useState<FlowStep[]>(() =>
    isNew ? [...sorted, makeBlankStep(sorted.length + 1)] : sorted
  );
  const activeIdx = isNew ? steps.length - 1 : stepIdx;
  const step = steps[activeIdx];

  if (!step) return null;

  const update = (patch: Partial<FlowStep>) =>
    setSteps(prev => prev.map((s, i) => i === activeIdx ? { ...s, ...patch } : s));
  const toggleTool = (tool: string) =>
    setSteps(prev => prev.map((s, i) => i !== activeIdx ? s :
      { ...s, tools: s.tools.includes(tool) ? s.tools.filter(t => t !== tool) : [...s.tools, tool] }));
  const toggleCtx = (src: string) =>
    setSteps(prev => prev.map((s, i) => i !== activeIdx ? s :
      { ...s, context_sources: s.context_sources.includes(src) ? s.context_sources.filter(c => c !== src) : [...s.context_sources, src] }));

  const handleSave = async () => {
    try {
      await onSaveSteps(flow.id, stepsPayload(steps));
      onClose();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to save flow steps'));
    }
  };
  const handleDelete = async () => {
    const next = steps.filter((_, i) => i !== activeIdx).map((s, i) => ({ ...s, position: i + 1 }));
    try {
      await onSaveSteps(flow.id, stepsPayload(next));
      onClose();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to delete flow step'));
    }
  };

  return (
    <StepModal step={step} idx={activeIdx} allSteps={steps} isNew={isNew}
      onUpdate={update} onToggleTool={toggleTool} onToggleContext={toggleCtx}
      onSave={handleSave} onDelete={handleDelete} onClose={onClose} />
  );
}

/* ─────────────────────────────────────────────────
   Flow header extra — type selector + step count (passed via headerExtra)
   ───────────────────────────────────────────────── */
function FlowHeaderExtra({ flow, allFlows, onSave, taskTypes }: {
  flow: Flow; allFlows: Flow[];
  onSave: FlowEditor2Props['onSave']; taskTypes: string[];
}) {
  const steps = flow.flow_steps;
  return <>
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
  </>;
}

/* ─────────────────────────────────────────────────
   Agents.md collapsible section (flow-specific, passed via listHeader)
   ───────────────────────────────────────────────── */
function AgentsMdSection({ flow, onSave }: { flow: Flow; onSave: FlowEditor2Props['onSave'] }) {
  const modal = useModal();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(flow.agents_md ?? '');
  const [saving, setSaving] = useState(false);

  const flowAgentsMd = flow.agents_md ?? '';
  useEffect(() => {
    setValue(flowAgentsMd);
  }, [flowAgentsMd]);
  const dirty = value !== flowAgentsMd;

  return (
    <div className={s.agentsMdSection}>
      <div className={s.sectionHeader}>
        <button className={s.sectionToggle} onClick={() => setOpen(v => !v)} type="button">
          <span className={`${s.sectionArrow} ${open ? s.sectionArrowOpen : ''}`}>&#9654;</span>
          agents.md
          {flowAgentsMd && !open && <span className={s.sectionHint}>(has content)</span>}
        </button>
        {dirty && (
          <button className="btn btnPrimary btnSm" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(flow.id, { agents_md: value });
              } catch (err) {
                await modal.alert('Error', getErrorMessage(err, 'Failed to save agents.md'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >{saving ? 'Saving...' : 'Save'}</button>
        )}
      </div>
      {open && (
        <div className={s.agentsMdBody}>
          <MdField value={value} onChange={setValue}
            placeholder="Shared instructions for all steps in this flow (markdown)..." />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   FlowEditor2 — Board using WorkstreamColumn directly
   ───────────────────────────────────────────────── */
export function FlowEditor2({ flows, setFlows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, onSwapColumns, projectId, taskTypes }: FlowEditor2Props) {
  const [creating, setCreating] = useState(false);

  const drag = useBoardDrag({ onSwapColumns });
  const modal = useModal();

  // Modal state at board level (not clipped by column overflow: hidden)
  const [modalTarget, setModalTarget] = useState<{ flowId: string; stepIdx: number } | null>(null);
  const modalFlow = modalTarget ? flows.find(f => f.id === modalTarget.flowId) : null;

  // Map each flow's steps to task-shaped objects
  const flowTasksMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof stepToTask>[]> = {};
    for (const flow of flows) {
      map[flow.id] = sortedSteps(flow).map((step, idx) => stepToTask(step, idx));
    }
    return map;
  }, [flows]);

  // Step index lookup: task.id -> { flowId, stepIdx }
  const stepLookup = useMemo(() => {
    const map = new Map<string, { flowId: string; stepIdx: number }>();
    for (const flow of flows) {
      const sorted = flow.flow_steps.slice().sort((a, b) => a.position - b.position);
      sorted.forEach((step, idx) => map.set(step.id, { flowId: flow.id, stepIdx: idx }));
    }
    return map;
  }, [flows]);

  // Task (step) drop: reorder within flow
  const handleDropTask = useCallback(async (workstreamId: string | null, dropBeforeTaskId: string | null) => {
    if (!drag.draggedTaskId || !workstreamId) return;
    const info = stepLookup.get(drag.draggedTaskId);
    if (!info || info.flowId !== workstreamId) return;
    const flow = flows.find(f => f.id === workstreamId);
    if (!flow) return;
    const sorted = flow.flow_steps.slice().sort((a, b) => a.position - b.position);
    const fromIdx = sorted.findIndex(s => s.id === drag.draggedTaskId);
    if (fromIdx < 0) return;
    const next = [...sorted];
    const [moved] = next.splice(fromIdx, 1);
    if (dropBeforeTaskId) {
      const toIdx = next.findIndex(s => s.id === dropBeforeTaskId);
      if (toIdx >= 0) next.splice(toIdx, 0, moved);
      else next.push(moved);
    } else {
      next.push(moved);
    }
    const reordered = next.map((s, i) => ({ ...s, position: i + 1 }));
    // Optimistic: update local flow steps
    setFlows(prev => prev.map(f =>
      f.id === workstreamId ? { ...f, flow_steps: reordered } : f
    ));
    try {
      await onSaveSteps(workstreamId, stepsPayload(reordered));
    } catch (err) {
      setFlows(prev => prev.map(f =>
        f.id === workstreamId ? { ...f, flow_steps: sorted } : f
      ));
      await modal.alert('Error', getErrorMessage(err, 'Failed to reorder flow steps'));
    } finally {
      drag.setDraggedTaskId(null);
    }
  }, [drag, stepLookup, flows, setFlows, onSaveSteps, modal]);

  const handleNewFlow = useCallback(async () => {
    setCreating(true);
    try {
      await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] });
    } catch (err) {
      console.error('Failed to create flow:', err);
    }
    finally { setCreating(false); }
  }, [projectId, onCreateFlow]);

  return (
    <div
      className={`${boardStyles.board} ${drag.isDragging ? boardStyles.boardDragging : ''}`}
      ref={drag.boardRef}
      data-board
      onDragOver={drag.handleBoardDragOver}
    >
      {flows.map(flow => (
        <WorkstreamColumn
          key={flow.id}
          workstream={flowToWorkstream(flow)}
          tasks={flowTasksMap[flow.id] || []}
          taskJobMap={EMPTY_JOB_MAP}
          isBacklog={false}
          canRunAi={false}
          projectId={projectId}
          mentionedTaskIds={EMPTY_SET}
          focusTaskId={null}
          draggedTaskId={drag.draggedTaskId}
          onDragTaskStart={drag.setDraggedTaskId}
          onDragTaskEnd={drag.handleDragEnd}
          onDropTask={handleDropTask}
          draggedWsId={drag.draggedWsId}
          onColumnDragStart={drag.setDraggedWsId}
          onColumnDrop={drag.handleColumnDrop}
          onRenameWorkstream={async (id, name) => { await onSave(id, { name }); }}
          onDeleteWorkstream={async (id) => { await onDeleteFlow(id); }}
          onAddTask={() => setModalTarget({ flowId: flow.id, stepIdx: -1 })}
          onEditTask={(task) => {
            const info = stepLookup.get(task.id);
            if (info) setModalTarget({ flowId: info.flowId, stepIdx: info.stepIdx });
          }}
          onDeleteTask={async (taskId) => {
            const info = stepLookup.get(taskId);
            if (!info) return;
            const flow = flows.find(f => f.id === info.flowId);
            if (!flow) return;
            const next = flow.flow_steps
              .filter(s => s.id !== taskId)
              .sort((a, b) => a.position - b.position)
              .map((s, i) => ({ ...s, position: i + 1 }));
            await onSaveSteps(info.flowId, stepsPayload(next));
          }}
          hideComments
          headerExtra={<FlowHeaderExtra flow={flow} allFlows={flows} onSave={onSave}
            taskTypes={taskTypes?.length ? taskTypes : BUILT_IN_TYPES} />}
          listHeader={<AgentsMdSection flow={flow} onSave={onSave} />}
          metaItems={(taskId: string) => {
            const info = stepLookup.get(taskId);
            if (!info) return undefined;
            const flow = flows.find(f => f.id === info.flowId);
            if (!flow) return undefined;
            const step = flow.flow_steps.slice().sort((a, b) => a.position - b.position)[info.stepIdx];
            if (!step) return undefined;
            return [
              { label: 'model', value: step.model },
              { label: 'tools', value: step.tools.join(', ') },
              ...(step.is_gate ? [{ label: 'gate', value: `max ${step.max_retries} retries, then ${step.on_max_retries}` }] : []),
            ];
          }}
          renderTaskCard={(cardProps) => (
            <FlowStepCard {...cardProps} />
          )}
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
