import type { TaskRecord } from '../lib/api';
import type { ModalContextValue } from './modal-context';

export interface ExecutionTasksResource {
  tasks: TaskRecord[];
  reload: () => Promise<unknown>;
}

export interface ExecutionJobsResource {
  reload: () => Promise<unknown>;
}

export interface ExecutionWorkstreamsResource {
  reload: () => Promise<unknown>;
  deleteWorkstream: (id: string) => Promise<void>;
}

export interface ExecutionActionContext {
  projectId: string | null;
  localPath?: string | null;
  modal: ModalContextValue;
}

export interface UseExecutionActionsParams extends ExecutionActionContext {
  tasks: ExecutionTasksResource;
  jobs: ExecutionJobsResource;
  workstreams: ExecutionWorkstreamsResource;
}
