export interface AutoContinueTask {
  id: string;
  project_id: string;
  type: string;
  mode: string | null;
  title: string;
  assignee: string | null;
  created_by: string | null;
  flow_id?: string | null;
}

export interface QueueNextWorkstreamTaskParams {
  completedTaskId: string;
  projectId: string;
  localPath: string;
  workstreamId: string;
  completedPosition: number;
}
