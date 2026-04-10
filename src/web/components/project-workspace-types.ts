import type { Dispatch, SetStateAction } from 'react';
import type { CustomTaskType, Flow, FlowStep, MemberRecord, NotificationRecord, ProjectDataSettings, TaskRecord, WorkstreamRecord } from '../lib/api';
import type { ProjectWorkspaceHeaderProps } from './ProjectWorkspaceHeader';
import type { ProjectWorkspaceModalsProps } from './ProjectWorkspaceModals';
import type { ProjectWorkspaceRoutesProps } from './ProjectWorkspaceRoutes';
import type { EditTaskData, TaskFormData } from './task-form-types';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { RelativeDropSide } from '../lib/optimistic-updates';

export interface ProjectWorkspaceProps {
  headerProps: ProjectWorkspaceHeaderProps;
  routesProps: ProjectWorkspaceRoutesProps;
  modalProps: ProjectWorkspaceModalsProps;
}

export interface CurrentProjectWorkspaceProps {
  project: {
    id: string;
    name: string;
    local_path: string | null;
    role: string;
  };
  projects: Array<{ id: string; name: string }>;
  profile: {
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
  todoItems: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string }>;
  reviewItems: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string; workstreamId?: string }>;
  tasks: TaskRecord[];
  activeWorkstreams: WorkstreamRecord[];
  allWorkstreams: WorkstreamRecord[];
  members: MemberRecord[];
  flows: Flow[];
  setFlows: Dispatch<SetStateAction<Flow[]>>;
  customTypes: CustomTaskType[];
  projectDataEnabled: boolean;
  projectDataSettings: ProjectDataSettings;
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
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
  onOpenAddProject: () => void;
  onSignOut: () => Promise<void>;
  onOpenMembersModal: () => void;
  onUpdateLocalPath?: (path: string) => void | Promise<void>;
  onCloseAddProject: () => void;
  onCreateProject: (name: string, localPath?: string) => Promise<void>;
  onCloseMembersModal: () => void;
  onSaveCustomType: (name: string) => Promise<void>;
  onCreateTask: (data: TaskFormData) => Promise<void>;
  onUpdateTaskForm: (taskId: string, data: TaskFormData) => Promise<void>;
  onCloseCreateTask: () => void;
  onCloseEditTask: () => void;
  onStartEditingTask: (task: TaskView, rawTask: TaskRecord) => void;
  onCreateWorkstream: (name: string, description?: string, hasCode?: boolean) => Promise<void>;
  onUpdateWorkstream: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteWorkstream: (id: string) => Promise<void>;
  onSwapColumns: (draggedId: string, targetId: string, side: RelativeDropSide, orderedIds: string[]) => void;
  onAddTask: (workstreamId: string | null) => void;
  onRunWorkstream: (workstreamId: string) => void;
  onRunTask: (taskId: string) => void;
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
  onSwapFlows: (draggedId: string, targetId: string, side: RelativeDropSide, orderedIds: string[]) => void;
  onReloadProjectDataSettings: () => Promise<ProjectDataSettings | undefined>;
}
