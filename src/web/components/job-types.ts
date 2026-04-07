export type JobStatus = 'queued' | 'running' | 'paused' | 'review' | 'done' | 'failed';

export interface CompletedPhaseRecord {
  name?: string;
  phase?: string;
  summary?: string;
}

export interface FlowSnapshotRecord {
  steps?: Array<{ name: string }>;
}

export interface ReviewResultRecord {
  files_changed?: number;
  filesChanged?: number;
  tests_passed?: boolean;
  testsPassed?: boolean;
  lines_added?: number;
  linesAdded?: number;
  lines_removed?: number;
  linesRemoved?: number;
  summary?: string;
  changed_files?: string[];
  changedFiles?: string[];
}

export interface JobRecord {
  id: string;
  task_id: string;
  project_id: string;
  status: JobStatus;
  current_phase: string | null;
  attempt: number;
  max_attempts: number;
  phases_completed: Array<string | CompletedPhaseRecord>;
  question: string | null;
  answer: string | null;
  review_result: ReviewResultRecord | null;
  flow_snapshot: FlowSnapshotRecord | null;
  started_at: string;
  completed_at: string | null;
}

export type JobView = {
  id: string;
  taskId: string;
  title: string;
  type: string;
  description?: string;
  status: JobStatus;
  phases?: { name: string; status: string; summary?: string }[];
  currentPhase?: string;
  attempt?: number;
  maxAttempts?: number;
  startedAt?: string;
  question?: string;
  review?: {
    filesChanged: number;
    testsPassed?: boolean;
    linesAdded: number;
    linesRemoved: number;
    summary: string;
    changedFiles?: string[];
  };
  completedAgo?: string;
  completedAt?: string;
  flow_snapshot?: FlowSnapshotRecord | null;
};
