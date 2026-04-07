import { pickPrimaryJobs } from './job-selection';
import { timeAgo } from './time';
import type { CompletedPhaseRecord, FlowSnapshotRecord, JobRecord, JobView } from '../components/job-types';

const TASK_TYPE_PHASES: Record<string, string[]> = {
  'bug-fix': ['plan', 'analyze', 'fix', 'verify', 'review'],
  feature: ['plan', 'implement', 'verify', 'review'],
  refactor: ['plan', 'analyze', 'refactor', 'verify', 'review'],
  test: ['plan', 'write-tests', 'verify', 'review'],
  'ui-fix': ['plan', 'implement', 'verify', 'review'],
  design: ['plan', 'implement', 'verify', 'review'],
  chore: ['plan', 'implement', 'verify', 'review'],
};

function cleanSummary(raw: string): string {
  return raw
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\[/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function buildPhases(
  phasesCompleted: Array<string | CompletedPhaseRecord>,
  currentPhase: string | null,
  taskType: string,
  flowSnapshot?: FlowSnapshotRecord | null,
): { name: string; status: string; summary?: string }[] {
  const completedMap = new Map<string, string>();

  for (const phase of phasesCompleted) {
    const name = typeof phase === 'string' ? phase : phase.name || phase.phase || '';
    if (!name) continue;
    const summary = typeof phase === 'string' ? '' : phase.summary || '';
    completedMap.set(name, summary);
  }

  const allPhases = flowSnapshot?.steps?.map(step => step.name)
    || TASK_TYPE_PHASES[taskType]
    || TASK_TYPE_PHASES.feature;

  return allPhases.map(name => {
    if (completedMap.has(name)) {
      return {
        name,
        status: 'completed',
        summary: completedMap.get(name) || undefined,
      };
    }
    if (name === currentPhase) return { name, status: 'current' };
    return { name, status: 'pending' };
  });
}

export function buildJobViews(
  jobs: JobRecord[],
  taskTitleMap: Record<string, string>,
  taskTypeMap: Record<string, string>,
) {
  const order: Record<string, number> = { running: 0, queued: 1, paused: 2, review: 3, done: 4, failed: 5 };
  const sorted = [...jobs].sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));

  return sorted.map(job => ({
    id: job.id,
    taskId: job.task_id,
    title: taskTitleMap[job.task_id] || 'Task',
    type: 'task',
    status: job.status as JobView['status'],
    currentPhase: job.current_phase || undefined,
    attempt: job.attempt,
    maxAttempts: job.max_attempts,
    startedAt: job.started_at || undefined,
    phases: buildPhases(
      job.phases_completed || [],
      job.current_phase,
      taskTypeMap[job.task_id] || 'feature',
      job.flow_snapshot,
    ),
    question: job.question || undefined,
    review: job.review_result ? {
      filesChanged: job.review_result.files_changed ?? job.review_result.filesChanged ?? 0,
      testsPassed: job.review_result.tests_passed ?? job.review_result.testsPassed,
      linesAdded: job.review_result.lines_added ?? job.review_result.linesAdded ?? 0,
      linesRemoved: job.review_result.lines_removed ?? job.review_result.linesRemoved ?? 0,
      summary: cleanSummary(job.review_result.summary ?? ''),
      changedFiles: job.review_result.changed_files ?? job.review_result.changedFiles ?? undefined,
    } : undefined,
    completedAgo: job.completed_at ? timeAgo(job.completed_at) : undefined,
    completedAt: job.completed_at || undefined,
  }));
}

export function buildPrimaryJobViews(jobViews: JobView[]) {
  return pickPrimaryJobs(jobViews);
}
