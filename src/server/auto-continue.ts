import { markHumanTaskInProgress } from './auto-continue-human.js';
import { checkWorkstreamHasOnlyFinishedTasks, findNextWorkstreamTask } from './auto-continue-next.js';
import { queueAiTask } from './auto-continue-queue.js';
import type { QueueNextWorkstreamTaskParams } from './auto-continue-types.js';
import { hasActiveWorkstreamJob } from './supabase.js';

/**
 * Find and queue the next AI task in a workstream after a task completes.
 * Shared by: worker (auto-approve), approve endpoint, task PATCH endpoint.
 * Returns the queued job ID if one was created, null otherwise.
 */
export async function queueNextWorkstreamTask(params: QueueNextWorkstreamTaskParams): Promise<string | null> {
  const { projectId, localPath, workstreamId, completedPosition } = params;

  const nextTask = await findNextWorkstreamTask({ projectId, workstreamId, completedPosition });
  if (!nextTask) {
    await checkWorkstreamHasOnlyFinishedTasks(workstreamId);
    return null;
  }

  if (nextTask.mode === 'human') {
    await markHumanTaskInProgress(nextTask, workstreamId);
    return null;
  }

  let activeJobId: string | null;
  try {
    activeJobId = await hasActiveWorkstreamJob(workstreamId);
  } catch (error) {
    console.error(`[auto-continue] Failed to check active workstream jobs for ${workstreamId}:`, error instanceof Error ? error.message : error);
    return null;
  }
  if (activeJobId) {
    console.log(`[auto-continue] Workstream ${workstreamId} already has an active job, skipping`);
    return null;
  }

  return queueAiTask({ task: nextTask, projectId, localPath });
}
