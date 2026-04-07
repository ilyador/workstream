import { useState } from 'react';
import type { TaskRecord } from '../lib/api';
import type { TaskView } from '../lib/task-view';
import type { EditTaskData } from '../components/task-form-types';

export function useTaskEditorState() {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormWorkstream, setTaskFormWorkstream] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<EditTaskData | null>(null);

  const openCreateTask = (workstreamId: string | null) => {
    setTaskFormWorkstream(workstreamId);
    setShowTaskForm(true);
  };

  const closeCreateTask = () => {
    setShowTaskForm(false);
    setTaskFormWorkstream(null);
  };

  const startEditingTask = (task: TaskView, rawTask?: TaskRecord) => {
    setEditingTask({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      mode: task.mode,
      effort: task.effort,
      multiagent: task.multiagent,
      assignee: rawTask?.assignee ?? null,
      flow_id: rawTask?.flow_id ?? null,
      images: task.images,
      workstream_id: task.workstream_id,
      auto_continue: task.auto_continue,
      priority: task.priority,
      chaining: rawTask?.chaining,
    });
  };

  const closeEditTask = () => {
    setEditingTask(null);
  };

  return {
    showTaskForm,
    taskFormWorkstream,
    editingTask,
    openCreateTask,
    closeCreateTask,
    startEditingTask,
    closeEditTask,
  };
}
