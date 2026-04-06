import type React from 'react';
import { Routes, Route } from 'react-router-dom';
import type { CustomTaskType, Flow, FlowStep, MemberRecord, NotificationRecord, TaskRecord, WorkstreamRecord } from '../lib/api';
import { Header } from './Header';
import { Board } from './Board';
import { ArchivePage } from './ArchivePage';
import { ProjectTaskDialogs } from './ProjectTaskDialogs';
import type { EditTaskData, TaskFormData } from './TaskForm';
import { AddProjectModal } from './AddProjectModal';
import { MembersModal } from './MembersModal';
import { FlowEditor2 } from './FlowEditor2';
import type { JobView } from './job-types';
import appStyles from '../App.module.css';

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
      {webNotifications.showPrompt && (
        <div className={appStyles.notificationPrompt}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={appStyles.notificationIcon}>
            <path d="M8 1.5C5.5 1.5 4 3.5 4 5.5V8L2.5 10.5V11.5H13.5V10.5L12 8V5.5C12 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 12.5C6.5 13.3 7.2 14 8 14C8.8 14 9.5 13.3 9.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>Enable notifications to stay updated on task progress</span>
          <button
            className={`btn btnPrimary btnSm ${appStyles.notificationAction}`}
            onClick={webNotifications.requestPermission}
          >Enable</button>
          <button
            className={`btn btnGhost btnSm ${appStyles.notificationDismiss}`}
            onClick={webNotifications.dismiss}
          >Dismiss</button>
        </div>
      )}

      <Header
        projectName={project.name}
        localPath={project.local_path ?? undefined}
        milestone={milestone}
        notifications={notifications.unreadCount}
        notificationList={notifications.notifications}
        onMarkRead={notifications.markRead}
        onMarkAllRead={notifications.markAllRead}
        todoItems={todoItems}
        reviewItems={reviewItems}
        userInitials={user.initials}
        projects={projects}
        currentProjectId={project.id}
        onSwitchProject={onSwitchProject}
        onNewProject={onNewProject}
        onSignOut={onSignOut}
        onManageMembers={onManageMembers}
        onUpdateLocalPath={onUpdateLocalPath}
      />

      <Routes>
        <Route path="/" element={
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
            currentUserId={user.id}
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
        } />
        <Route path="/archive" element={
          <ArchivePage
            workstreams={allWorkstreams.filter(workstream => workstream.status === 'archived')}
            tasks={tasks}
            jobs={jobs}
            memberMap={memberMap}
            projectId={project.id}
            onRestore={onRestoreArchiveWorkstream}
            onUpdateTask={onUpdateTask}
          />
        } />
        <Route path="/flows" element={
          <FlowEditor2
            flows={flows}
            setFlows={setFlows}
            projectId={project.id}
            onSave={onSaveFlow}
            onSaveSteps={onSaveFlowSteps}
            onCreateFlow={onCreateFlow}
            onDeleteFlow={onDeleteFlow}
            onSwapColumns={onSwapFlows}
          />
        } />
      </Routes>

      <ProjectTaskDialogs
        projectId={project.id}
        localPath={project.local_path ?? undefined}
        workstreams={activeWorkstreams}
        members={members}
        flows={flows}
        customTypes={customTypes}
        showCreate={showTaskForm}
        defaultWorkstreamId={taskFormWorkstream}
        editingTask={editingTask}
        onSaveCustomType={onSaveCustomType}
        onCreateTask={onCreateTask}
        onUpdateTask={onUpdateTaskForm}
        onCloseCreate={onCloseCreateTask}
        onCloseEdit={onCloseEditTask}
      />

      {showAddProject && (
        <AddProjectModal
          onClose={onCloseAddProject}
          onCreate={onCreateProject}
        />
      )}

      {showMembersModal && (
        <MembersModal
          projectId={project.id}
          currentUserId={user.id}
          onClose={onCloseMembersModal}
        />
      )}
    </>
  );
}
