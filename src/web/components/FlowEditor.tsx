import type React from 'react';
import type { Flow } from '../lib/api';
import { WorkstreamColumn } from './WorkstreamColumn';
import { TaskCardView } from './TaskCard';
import { FlowHeaderExtra } from './FlowHeaderExtra';
import { FlowAgentsMdSection } from './FlowAgentsMdSection';
import { FlowStepModal } from './FlowStepModal';
import { flowToWorkstream, type FlowStepInput } from '../lib/flow-editor';
import { useFlowBoard } from '../hooks/useFlowBoard';
import s from './FlowEditor.module.css';

interface FlowEditorProps {
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
export function FlowEditor({ flows, setFlows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, onSwapColumns, projectId, taskTypes }: FlowEditorProps) {
  const {
    creating,
    drag,
    flowTasksMap,
    modalFlow,
    modalTarget,
    stepMetaMap,
    handleDeleteStep,
    handleDropTask,
    handleNewFlow,
    openExistingStepModal,
    openNewStepModal,
    closeStepModal,
  } = useFlowBoard({
    flows,
    setFlows,
    projectId,
    onSaveSteps,
    onCreateFlow,
    onSwapColumns,
  });
  const {
    boardRef,
    draggedTaskId,
    setDraggedTaskId,
    draggedWsId,
    setDraggedWsId,
    handleDragEnd,
    handleBoardDragOver,
    handleColumnDrop,
    isDragging,
  } = drag;

  return (
    <div
      className={`${s.flowBoard} ${isDragging ? s.flowBoardDragging : ''}`}
      ref={boardRef}
      data-board
      onDragOver={handleBoardDragOver}
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
          draggedTaskId={draggedTaskId}
          onDragTaskStart={setDraggedTaskId}
          onDragTaskEnd={handleDragEnd}
          onDropTask={handleDropTask}
          draggedWsId={draggedWsId}
          onColumnDragStart={setDraggedWsId}
          onColumnDrop={handleColumnDrop}
          onRenameWorkstream={async (id, name) => { await onSave(id, { name }); }}
          onDeleteWorkstream={async (id) => { await onDeleteFlow(id); }}
          onAddTask={() => openNewStepModal(flow.id)}
          onEditTask={(task) => { openExistingStepModal(task.id); }}
          onDeleteTask={handleDeleteStep}
          hideComments
          headerExtra={<FlowHeaderExtra flow={flow} allFlows={flows} onSave={onSave} taskTypes={taskTypes} />}
          listHeader={<FlowAgentsMdSection flow={flow} onSave={onSave} />}
          metaItems={(taskId: string) => stepMetaMap.get(taskId)}
          renderTaskCard={(cardProps) => (
            <TaskCardView {...cardProps} viewMode="flow-step" />
          )}
        />
      ))}

      <button className={s.addFlowButton} onClick={handleNewFlow} disabled={creating}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {creating ? 'Creating...' : 'Add flow'}
      </button>

      {/* Step modal at board level — backdrop not clipped */}
      {modalTarget && modalFlow && (
        <FlowStepModal
          flow={modalFlow}
          stepIndex={modalTarget.stepIndex}
          onSaveSteps={onSaveSteps}
          onClose={closeStepModal}
        />
      )}
    </div>
  );
}
