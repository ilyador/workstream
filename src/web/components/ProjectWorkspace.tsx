import type React from 'react';
import type { CustomTaskType, Flow, FlowStep, MemberRecord, NotificationRecord, TaskRecord, WorkstreamRecord } from '../lib/api';
import type { EditTaskData, TaskFormData } from './TaskForm';
import type { JobView } from './job-types';
import { ProjectWorkspaceHeader } from './ProjectWorkspaceHeader';
import { ProjectWorkspaceRoutes } from './ProjectWorkspaceRoutes';
import { ProjectWorkspaceModals } from './ProjectWorkspaceModals';

interface ProjectWorkspaceProps {
  project: {
    id: string;
    name: string;
    local_path: string | null;
    role: string;
  };
  projects: Array<{ id: string; name: string }>;
  user: {
    id: string;
    initials: string;
  };
  webNotifications: {
    showPrompt: boolean;
    requestPermission: () => void | Promise<void>;
    dismiss: () => void;
  };
  notifications: {
    unreadCount: number;
    notifications: NotificationRecord[];
    markRead: (id: string) => void | Promise<void>;
    markAllRead: () => void | Promise<void>;
  };
  milestone: {
    name: string;
    tasksDone: number;
    tasksTotal: number;
  };
  todoItems: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string }>;
  reviewItems: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string; workstreamId?: string }>;
  tasks: TaskRecord[];
  activeWorkstreams: WorkstreamRecord[];
  allWorkstreams: WorkstreamRecord[];
  members: MemberRecord[];
  flows: Flow[];
  setFlows: React.Dispatch<React.SetStateAction<Flow[]>>;
  customTypes: CustomTaskType[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
  typeFlowMap: Record<string, string>;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
  focusWsId: string | null;
  showTaskForm: boolean;
  taskFormWorkstream: string | null;
  editingTask: EditTaskData | null;
  showAddProject: boolean;
  showMembersModal: boolean;
  onSwitchProject: (projectId: string) => void | Promise<void>;
  onNewProject: () => void;
  onSignOut: () => Promise<void>;
  onManageMembers: () => void;
  onUpdateLocalPath?: (path: string) => void | Promise<void>;
  onCloseAddProject: () => void;
  onCreateProject: (name: string, localPath?: string) => Promise<void>;
  onCloseMembersModal: () => void;
  onSaveCustomType: (name: string, pipeline: string) => Promise<void>;
  onCreateTask: (data: TaskFormData) => Promise<void>;
  onUpdateTaskForm: (taskId: string, data: TaskFormData) => Promise<void>;
  onCloseCreateTask: () => void;
  onCloseEditTask: () => void;
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

export function ProjectWorkspace({
  project,
  projects,
  user,
  webNotifications,
  notifications,
  milestone,
  todoItems,
  reviewItems,
  tasks,
  activeWorkstreams,
  allWorkstreams,
  members,
  flows,
  setFlows,
  customTypes,
  jobs,
  memberMap,
  flowMap,
  typeFlowMap,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  showTaskForm,
  taskFormWorkstream,
  editingTask,
  showAddProject,
  showMembersModal,
  onSwitchProject,
  onNewProject,
  onSignOut,
  onManageMembers,
  onUpdateLocalPath,
  onCloseAddProject,
  onCreateProject,
  onCloseMembersModal,
  onSaveCustomType,
  onCreateTask,
  onUpdateTaskForm,
  onCloseCreateTask,
  onCloseEditTask,
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
}: ProjectWorkspaceProps) {
  return (
    <>
      <ProjectWorkspaceHeader
        project={project}
        projects={projects}
        user={user}
        webNotifications={webNotifications}
        notifications={notifications}
        milestone={milestone}
        todoItems={todoItems}
        reviewItems={reviewItems}
        onSwitchProject={onSwitchProject}
        onNewProject={onNewProject}
        onSignOut={onSignOut}
        onManageMembers={onManageMembers}
        onUpdateLocalPath={onUpdateLocalPath}
      />

      <ProjectWorkspaceRoutes
        project={project}
        tasks={tasks}
        jobs={jobs}
        activeWorkstreams={activeWorkstreams}
        allWorkstreams={allWorkstreams}
        flows={flows}
        setFlows={setFlows}
        memberMap={memberMap}
        flowMap={flowMap}
        typeFlowMap={typeFlowMap}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        focusTaskId={focusTaskId}
        focusWsId={focusWsId}
        userId={user.id}
        onCreateWorkstream={onCreateWorkstream}
        onUpdateWorkstream={onUpdateWorkstream}
        onDeleteWorkstream={onDeleteWorkstream}
        onSwapColumns={onSwapColumns}
        onAddTask={onAddTask}
        onRunWorkstream={onRunWorkstream}
        onRunTask={onRunTask}
        onEditTask={onEditTask}
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
        onRestoreArchiveWorkstream={onRestoreArchiveWorkstream}
        onSaveFlow={onSaveFlow}
        onSaveFlowSteps={onSaveFlowSteps}
        onCreateFlow={onCreateFlow}
        onDeleteFlow={onDeleteFlow}
        onSwapFlows={onSwapFlows}
      />

      <ProjectWorkspaceModals
        project={project}
        userId={user.id}
        activeWorkstreams={activeWorkstreams}
        members={members}
        flows={flows}
        customTypes={customTypes}
        showTaskForm={showTaskForm}
        taskFormWorkstream={taskFormWorkstream}
        editingTask={editingTask}
        showAddProject={showAddProject}
        showMembersModal={showMembersModal}
        onSaveCustomType={onSaveCustomType}
        onCreateTask={onCreateTask}
        onUpdateTaskForm={onUpdateTaskForm}
        onCloseCreateTask={onCloseCreateTask}
        onCloseEditTask={onCloseEditTask}
        onCloseAddProject={onCloseAddProject}
        onCreateProject={onCreateProject}
        onCloseMembersModal={onCloseMembersModal}
      />
    </>
  );
}
