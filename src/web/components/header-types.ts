import type { ProjectSummary } from '../lib/api';

export interface ActionItem {
  id: string;
  label: string;
  sublabel?: string;
  tag?: string;
  taskId?: string;
  workstreamId?: string;
}

export type HeaderProjectSummary = Pick<ProjectSummary, 'id' | 'name'>;
