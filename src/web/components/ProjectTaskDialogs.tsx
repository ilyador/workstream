import { TaskForm, type EditTaskData, type TaskFormData } from './TaskForm';
import type { CustomTaskType, Flow, MemberRecord, WorkstreamRecord } from '../lib/api';

interface ProjectTaskDialogsProps {
  projectId: string;
  localPath?: string;
  workstreams: WorkstreamRecord[];
  members: MemberRecord[];
  flows: Flow[];
  customTypes: CustomTaskType[];
  showCreate: boolean;
  defaultWorkstreamId: string | null;
  editingTask: EditTaskData | null;
  onSaveCustomType: (name: string, pipeline: string) => Promise<void>;
  onCreateTask: (data: TaskFormData) => Promise<void>;
  onUpdateTask: (taskId: string, data: TaskFormData) => Promise<void>;
  onCloseCreate: () => void;
  onCloseEdit: () => void;
}

export function ProjectTaskDialogs({
  localPath,
  workstreams,
  members,
  flows,
  customTypes,
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
  const customTypeOptions = customTypes.map(type => ({ id: type.id, name: type.name, pipeline: type.pipeline }));

  return (
    <>
      {showCreate && (
        <TaskForm
          localPath={localPath}
          workstreams={workstreamOptions}
          defaultWorkstreamId={defaultWorkstreamId}
          members={memberOptions}
          flows={flows}
          customTypes={customTypeOptions}
          onSaveCustomType={onSaveCustomType}
          onSubmit={onCreateTask}
          onClose={onCloseCreate}
        />
      )}

      {editingTask && (
        <TaskForm
          localPath={localPath}
          workstreams={workstreamOptions}
          members={memberOptions}
          flows={flows}
          customTypes={customTypeOptions}
          onSaveCustomType={onSaveCustomType}
          editTask={editingTask}
          onSubmit={(data) => onUpdateTask(editingTask.id, data)}
          onClose={onCloseEdit}
        />
      )}
    </>
  );
}
