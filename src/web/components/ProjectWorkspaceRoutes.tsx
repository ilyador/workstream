import { Route, Routes } from 'react-router-dom';
import type { Flow, FlowStep, TaskRecord, WorkstreamRecord } from '../lib/api';
import { Board } from './Board';
import { ArchivePage } from './ArchivePage';
import { FlowEditor } from './FlowEditor';
import type { JobView } from './job-types';

interface ProjectWorkspaceRoutesProps {
  project: {
    id: string;
    role: string;
  };
  tasks: TaskRecord[];
  jobs: JobView[];
  activeWorkstreams: WorkstreamRecord[];
  allWorkstreams: WorkstreamRecord[];
  flows: Flow[];
  setFlows: React.Dispatch<React.SetStateAction<Flow[]>>;
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
  typeFlowMap: Record<string, string>;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
  focusWsId: string | null;
  userId: string;
  onCreateWorkstream: (name: string, description?: string, hasCode?: boolean) => Promise<void>;
  onUpdateWorkstream: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteWorkstream: (id: string) => Promise<void>;
  onSwapColumns: (draggedId: string, targetId: string) => void;
  onAddTask: (workstreamId: string | null) => void;
  onRunWorkstream: (workstreamId: string) => void;
  onRunTask: (taskId: string) => void;
  onEditTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onMoveTask: (taskId: string, workstreamId: string | null, newPosition: number) => void;
  onTerminate: (jobId: string) => void;
  onReply: (jobId: string, answer: string) => void;
  onApprove: (jobId: string) => void;
  onReject: (jobId: string) => void;
  onRework: (jobId: string, note: string) => void;
  onDeleteJob: (jobId: string) => void;
  onMoveToBacklog: (jobId: string) => void;
  onContinue: (jobId: string) => void;
  onCreatePr: (workstreamId: string, options?: { review?: boolean }) => void;
  onRestoreArchiveWorkstream: (workstreamId: string) => Promise<void>;
  onSaveFlow: (flowId: string, updates: { name?: string; description?: string; agents_md?: string; default_types?: string[]; position?: number }) => Promise<void>;
  onSaveFlowSteps: (flowId: string, steps: Array<Omit<FlowStep, 'id'>>) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: Array<Omit<FlowStep, 'id'>> }) => Promise<Flow>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  onSwapFlows: (draggedId: string, targetId: string) => void;
}

export function ProjectWorkspaceRoutes({
  project,
  tasks,
  jobs,
  activeWorkstreams,
  allWorkstreams,
  flows,
  setFlows,
  memberMap,
  flowMap,
  typeFlowMap,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  userId,
  onCreateWorkstream,
  onUpdateWorkstream,
  onDeleteWorkstream,
  onSwapColumns,
  onAddTask,
  onRunWorkstream,
  onRunTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onMoveTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onCreatePr,
  onRestoreArchiveWorkstream,
  onSaveFlow,
  onSaveFlowSteps,
  onCreateFlow,
  onDeleteFlow,
  onSwapFlows,
}: ProjectWorkspaceRoutesProps) {
  return (
    <Routes>
      <Route
        path="/"
        element={(
          <Board
            workstreams={activeWorkstreams}
            tasks={tasks}
            jobs={jobs}
            memberMap={memberMap}
            flowMap={flowMap}
            typeFlowMap={typeFlowMap}
            userRole={project.role || 'dev'}
            projectId={project.id}
            mentionedTaskIds={mentionedTaskIds}
            commentCounts={commentCounts}
            focusTaskId={focusTaskId}
            focusWsId={focusWsId}
            currentUserId={userId}
            onCreateWorkstream={onCreateWorkstream}
            onUpdateWorkstream={onUpdateWorkstream}
            onDeleteWorkstream={onDeleteWorkstream}
            onSwapColumns={onSwapColumns}
            onAddTask={onAddTask}
            onRunWorkstream={onRunWorkstream}
            onRunTask={onRunTask}
            onEditTask={(task) => onEditTask(task.id)}
            onDeleteTask={onDeleteTask}
            onUpdateTask={onUpdateTask}
            onMoveTask={onMoveTask}
            onTerminate={onTerminate}
            onReply={onReply}
            onApprove={onApprove}
            onReject={onReject}
            onRework={onRework}
            onDeleteJob={onDeleteJob}
            onMoveToBacklog={onMoveToBacklog}
            onContinue={onContinue}
            onCreatePr={onCreatePr}
          />
        )}
      />
      <Route
        path="/archive"
        element={(
          <ArchivePage
            workstreams={allWorkstreams.filter(workstream => workstream.status === 'archived')}
            tasks={tasks}
            jobs={jobs}
            memberMap={memberMap}
            projectId={project.id}
            onRestore={onRestoreArchiveWorkstream}
            onUpdateTask={onUpdateTask}
          />
        )}
      />
      <Route
        path="/flows"
        element={(
          <FlowEditor
            flows={flows}
            setFlows={setFlows}
            projectId={project.id}
            onSave={onSaveFlow}
            onSaveSteps={onSaveFlowSteps}
            onCreateFlow={onCreateFlow}
            onDeleteFlow={onDeleteFlow}
            onSwapColumns={onSwapFlows}
          />
        )}
      />
    </Routes>
  );
}
