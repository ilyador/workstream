import type { TaskFormData } from '../components/task-form-types';

export function toTaskMutationPayload(data: TaskFormData) {
  return {
    title: data.title,
    description: data.description,
    type: data.type,
    mode: data.mode,
    effort: data.effort,
    multiagent: data.multiagent,
    assignee: data.assignee,
    flow_id: data.flow_id,
    auto_continue: data.auto_continue,
    allow_project_data: data.allow_project_data,
    images: data.images,
    workstream_id: data.workstream_id,
    priority: data.priority,
    chaining: data.chaining,
  };
}

export function toTaskCreatePayload(projectId: string, data: TaskFormData) {
  return {
    project_id: projectId,
    ...toTaskMutationPayload(data),
  };
}
