export type JobView = {
  id: string;
  taskId: string;
  title: string;
  type: string;
  description?: string;
  status: 'queued' | 'running' | 'paused' | 'review' | 'done' | 'failed';
  phases?: { name: string; status: string }[];
  currentPhase?: string;
  attempt?: number;
  maxAttempts?: number;
  startedAt?: string;
  question?: string;
  review?: {
    filesChanged: number;
    testsPassed: boolean;
    linesAdded: number;
    linesRemoved: number;
    summary: string;
    changedFiles?: string[];
  };
  completedAgo?: string;
  flow_snapshot?: any;
};

