import type { CustomTaskType, Flow, MemberRecord, WorkstreamRecord } from '../lib/api';
import { ProjectTaskDialogs } from './ProjectTaskDialogs';
import type { EditTaskData, TaskFormData } from './TaskForm';
import { AddProjectModal } from './AddProjectModal';
import { MembersModal } from './MembersModal';

interface ProjectWorkspaceModalsProps {
  project: {
    id: string;
    local_path: string | null;
  };
  userId: string;
  activeWorkstreams: WorkstreamRecord[];
  members: MemberRecord[];
  flows: Flow[];
  customTypes: CustomTaskType[];
  showTaskForm: boolean;
  taskFormWorkstream: string | null;
  editingTask: EditTaskData | null;
  showAddProject: boolean;
  showMembersModal: boolean;
  onSaveCustomType: (name: string, pipeline: string) => Promise<void>;
  onCreateTask: (data: TaskFormData) => Promise<void>;
  onUpdateTaskForm: (taskId: string, data: TaskFormData) => Promise<void>;
  onCloseCreateTask: () => void;
  onCloseEditTask: () => void;
  onCloseAddProject: () => void;
  onCreateProject: (name: string, localPath?: string) => Promise<void>;
  onCloseMembersModal: () => void;
}

export function ProjectWorkspaceModals({
  project,
  userId,
  activeWorkstreams,
  members,
  flows,
  customTypes,
  showTaskForm,
  taskFormWorkstream,
  editingTask,
  showAddProject,
  showMembersModal,
  onSaveCustomType,
  onCreateTask,
  onUpdateTaskForm,
  onCloseCreateTask,
  onCloseEditTask,
  onCloseAddProject,
  onCreateProject,
  onCloseMembersModal,
}: ProjectWorkspaceModalsProps) {
  return (
    <>
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
          currentUserId={userId}
          onClose={onCloseMembersModal}
        />
      )}
    </>
  );
}
