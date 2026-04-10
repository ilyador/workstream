import { TaskForm } from './TaskForm';
import type { EditTaskData, TaskFormData } from './task-form-types';
import type { CustomTaskType, Flow, MemberRecord, WorkstreamRecord } from '../lib/api';

interface ProjectTaskDialogsProps {
  projectId: string;
  localPath?: string;
  workstreams: WorkstreamRecord[];
  members: MemberRecord[];
  flows: Flow[];
  customTypes: CustomTaskType[];
  projectDataEnabled: boolean;
  showCreate: boolean;
  defaultWorkstreamId: string | null;
  editingTask: EditTaskData | null;
  onSaveCustomType: (name: string) => Promise<void>;
  onCreateTask: (data: TaskFormData) => Promise<void>;
  onUpdateTask: (taskId: string, data: TaskFormData) => Promise<void>;
  onCloseCreate: () => void;
  onCloseEdit: () => void;
}

export function ProjectTaskDialogs({
  projectId,
  localPath,
  workstreams,
  members,
  flows,
  customTypes,
  projectDataEnabled,
  showCreate,
  defaultWorkstreamId,
  editingTask,
  onSaveCustomType,
  onCreateTask,
  onUpdateTask,
  onCloseCreate,
  onCloseEdit,
}: ProjectTaskDialogsProps) {
  const workstreamOptions = workstreams.map(workstream => ({ id: workstream.id, name: workstream.name }));
  const memberOptions = members.map(member => ({ id: member.id, name: member.name, initials: member.initials }));
  const customTypeOptions = customTypes.map(type => ({ id: type.id, name: type.name }));

  return (
    <>
      {showCreate && (
        <TaskForm
          localPath={localPath}
          projectId={projectId}
          workstreams={workstreamOptions}
          defaultWorkstreamId={defaultWorkstreamId}
          members={memberOptions}
          flows={flows}
          customTypes={customTypeOptions}
          projectDataEnabled={projectDataEnabled}
          onSaveCustomType={onSaveCustomType}
          onSubmit={onCreateTask}
          onClose={onCloseCreate}
        />
      )}

      {editingTask && (
        <TaskForm
          localPath={localPath}
          projectId={projectId}
          workstreams={workstreamOptions}
          members={memberOptions}
          flows={flows}
          customTypes={customTypeOptions}
          projectDataEnabled={projectDataEnabled}
          onSaveCustomType={onSaveCustomType}
          editTask={editingTask}
          onSubmit={(data) => onUpdateTask(editingTask.id, data)}
          onClose={onCloseEdit}
        />
      )}
    </>
  );
}
