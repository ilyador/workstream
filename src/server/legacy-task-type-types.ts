interface PhaseConfig {
  skill: string | null;
  tools: string[];
  prompt: string;
  model: string;
}

export interface TaskTypeConfig {
  phases: string[];
  on_verify_fail: string;
  verify_retries: number;
  final: string;
  on_review_fail: string;
  review_retries: number;
  on_max_retries: string;
  phase_config: Record<string, PhaseConfig>;
}
