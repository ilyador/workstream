import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { supabase } from '../supabase.js';
import { stagedDiffStat } from '../git-utils.js';
import { getActiveProcessCount } from '../process-lifecycle.js';
import type { FlowConfig, FlowStepConfig } from '../flow-config.js';
import { buildStepPrompt } from './prompt-builder.js';
import {
  extractPhaseSummary,
  extractVerdict,
  legacyVerifyCheck,
  legacyReviewCheck,
} from './gate-evaluation.js';
import { executeFlowStep, summarize } from '../runtimes/index.js';
import { lookupProjectId } from '../realtime-core-handlers.js';

const PAUSE_KEYWORDS = ['Should I', 'Could you', 'Which', 'clarif'];

function detectPauseQuestion(output: string): string | null {
  const candidateLines = output.trim().split('\n').slice(-5).filter(l => {
    const trimmed = l.trim();
    return !trimmed.startsWith('- ') && !trimmed.startsWith('RULES:') && !trimmed.startsWith('IMPORTANT:');
  });
  const lastLines = candidateLines.join('\n');
  if (!lastLines.includes('?')) return null;
  if (!PAUSE_KEYWORDS.some(kw => lastLines.includes(kw))) return null;
  return lastLines;
}

interface GateResult {
  failed: boolean;
  reason: string;
}

function checkGate(step: FlowStepConfig, output: string): GateResult {
  const verdict = extractVerdict(output);
  if (verdict) {
    return {
      failed: !verdict.passed,
      reason: verdict.reason || `${step.name} failed (see output)`,
    };
  }
  const isReview = step.name === 'review' || step.context_sources.includes('review_criteria');
  const failed = isReview ? legacyReviewCheck(output) : legacyVerifyCheck(output);
  return {
    failed,
    reason: `${step.name} failed (see output)`,
  };
}

const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', pdf: 'application/pdf',
  md: 'text/markdown', txt: 'text/plain', json: 'application/json',
  csv: 'text/csv', html: 'text/html', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

/** Scan .artifacts/ directory, upload to storage, insert records, then clean up. */
export async function scanAndUploadArtifacts(
  localPath: string,
  taskId: string,
  jobId: string,
  lastPhase: string,
  onLog: (text: string) => void,
): Promise<void> {
  const artifactsDir = join(localPath, '.artifacts');
  if (!existsSync(artifactsDir)) return;

  const files = readdirSync(artifactsDir);
  const projectId = await lookupProjectId('tasks', taskId);
  if (!projectId) {
    onLog(`[artifact] Skipping artifacts: could not resolve project_id\n`);
    return;
  }

  let hadFailure = false;
  for (const filename of files) {
    const filePath = join(artifactsDir, filename);
    try {
      const fileStat = statSync(filePath);
      if (!fileStat.isFile()) continue;
      if (filename.includes('..') || filename.includes('/')) {
        onLog(`[artifact] Skipping unsafe filename: ${filename}\n`);
        continue;
      }
      const fileBuffer = readFileSync(filePath);
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const storagePath = `${projectId}/${taskId}/${filename}`;

      const { error: uploadError } = await supabase.storage.from('task-artifacts').upload(storagePath, fileBuffer, {
        contentType: mimeType, upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { error: insertError } = await supabase.from('task_artifacts').upsert({
        task_id: taskId, job_id: jobId, phase: lastPhase,
        filename, mime_type: mimeType, size_bytes: fileStat.size, storage_path: storagePath,
      }, { onConflict: 'task_id,filename' });
      if (insertError) throw new Error(insertError.message);
      onLog(`[artifact] Captured: ${filename} (${mimeType}, ${fileStat.size} bytes)\n`);
      rmSync(filePath, { force: true });
    } catch (err: any) {
      hadFailure = true;
      onLog(`[artifact] Failed to capture ${filename}: ${err.message}\n`);
    }
  }
  if (hadFailure) {
    onLog('[artifact] Leaving .artifacts/ in place because one or more files failed to upload\n');
    return;
  }
  try { rmSync(artifactsDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

export interface FlowJobContext {
  jobId: string;
  taskId: string;
  projectId: string;
  localPath: string;
  task: any;
  flow: FlowConfig;
  phasesAlreadyCompleted: any[];
  onLog: (text: string) => void;
  onPhaseStart: (phase: string, attempt: number) => void;
  onPhaseComplete: (phase: string, output: any) => void;
  onPause: (question: string) => void;
  onReview: (result: any) => Promise<void> | void;
  onDone: () => Promise<void> | void;
  onFail: (error: string) => void;
}

type JobUpdateResult = 'updated' | 'canceled' | 'error';

function summaryRuntimeStep(flow: FlowConfig): FlowStepConfig {
  return [...flow.steps].reverse().find(step => step.runtime_kind === 'coding') ?? flow.steps[0];
}

/** Execute a job using the flow-based system. */
export async function runFlowJob(ctx: FlowJobContext): Promise<void> {
  const { jobId, task, flow, localPath, onLog, onPhaseStart, onPhaseComplete, onPause, onReview, onDone, onFail, phasesAlreadyCompleted } = ctx;

  const phasesCompleted: any[] = [...phasesAlreadyCompleted];
  const completedPhaseNames = new Set(phasesAlreadyCompleted.map((p: any) => p.phase));

  // On resume with a human answer, remove the paused phase so it re-runs
  if (phasesAlreadyCompleted.length > 0 && task.answer) {
    const lastPhase = phasesAlreadyCompleted[phasesAlreadyCompleted.length - 1]?.phase;
    if (lastPhase) completedPhaseNames.delete(lastPhase);
  }

  const steps = flow.steps;

  // Track cumulative attempts per step so jump-back retries don't reset the counter
  const stepAttemptOffsets: Record<string, number> = {};
  const MAX_TOTAL_JUMPS = 50;
  let totalJumps = 0;

  let i = 0;
  while (i < steps.length) {
    const step = steps[i];

    if (completedPhaseNames.has(step.name)) {
      onLog(`\n--- Skipping already-completed step: ${step.name} ---\n`);
      i++;
      continue;
    }

    const maxAttempts = step.max_retries + 1;
    const attemptOffset = stepAttemptOffsets[step.name] || 0;

    for (let attempt = 1; attempt <= maxAttempts - attemptOffset; attempt++) {
      const displayAttempt = attemptOffset + attempt;
      onPhaseStart(step.name, displayAttempt);

      if (await updateRunningJob(jobId, {
        current_phase: step.name,
        attempt: displayAttempt,
        question: null,
      }) !== 'updated') return;

      const prompt = await buildStepPrompt(step, flow, task, phasesCompleted, localPath, task.answer);

      onLog(`\n--- Step: ${step.name} (attempt ${displayAttempt}/${maxAttempts}) ---\n`);

      try {
        if (!await isJobStillRunning(jobId)) return;
        const output = await executeFlowStep({
          jobId,
          step,
          task,
          cwd: localPath,
          prompt,
          onLog,
        });
        if (!await isJobStillRunning(jobId)) return;

        const phaseOutput = {
          phase: step.name,
          attempt: displayAttempt,
          output: output.substring(0, 10000),
          summary: extractPhaseSummary(output),
        };
        phasesCompleted.push(phaseOutput);
        await savePhases(jobId, phasesCompleted);
        if (!await isJobStillRunning(jobId)) return;
        onPhaseComplete(step.name, phaseOutput);

        // Check if claude asked a question
        const pauseQuestion = detectPauseQuestion(output);
        if (pauseQuestion) {
          if (await updateRunningJob(jobId, {
            status: 'paused',
            question: pauseQuestion,
            phases_completed: phasesCompleted,
          }) === 'canceled') return;
          await updateTaskStatus(task.id, 'paused');
          onPause(pauseQuestion);
          return;
        }

        // Gate check (verify/review steps)
        if (step.is_gate) {
          const verdict = extractVerdict(output);
          if (!verdict) {
            console.warn(`[runner] Job ${jobId}: gate step '${step.name}' returned no structured verdict, using legacy heuristics`);
          }
          const gateResult = checkGate(step, output);
          const failed = gateResult.failed;
          const reason = gateResult.reason;

          if (failed && displayAttempt < maxAttempts) {
            if (step.on_fail_jump_to != null) {
              const jumpIndex = steps.findIndex(s => s.position === step.on_fail_jump_to);
              if (jumpIndex >= 0 && jumpIndex < i) {
                if (++totalJumps > MAX_TOTAL_JUMPS) {
                  const msg = `Aborting: exceeded ${MAX_TOTAL_JUMPS} total jump-back retries (possible cycle)`;
                  if (await updateRunningJob(jobId, { status: 'failed', phases_completed: phasesCompleted, completed_at: new Date().toISOString(), question: msg }) === 'canceled') return;
                  await updateTaskStatus(task.id, 'paused');
                  onFail(msg);
                  return;
                }
                const retryMsg = `${step.name} failed (attempt ${displayAttempt}/${maxAttempts}): ${reason}. Retrying from '${steps[jumpIndex].name}'...`;
                onLog(`\n${retryMsg}\n`);
                if (await updateRunningJob(jobId, { question: retryMsg }) !== 'updated') return;
                await supabase.from('job_logs').insert({ job_id: jobId, event: 'log', data: { text: `[retry] ${retryMsg}` } });
                // Clear steps from jumpIndex through i so they re-run
                // Preserve failed step's output for retry context
                const failedOutput = phasesCompleted.find(p => p.phase === step.name)?.output;
                for (let ci = jumpIndex; ci <= i; ci++) {
                  completedPhaseNames.delete(steps[ci].name);
                }
                for (let pi = phasesCompleted.length - 1; pi >= 0; pi--) {
                  const stepIdx = steps.findIndex(s => s.name === phasesCompleted[pi].phase);
                  if (stepIdx >= jumpIndex && stepIdx <= i) { phasesCompleted.splice(pi, 1); }
                }
                // Store gate feedback on the job -- steps with 'gate_feedback' context source will pick it up
                if (failedOutput) {
                  task._gateFeedback = `${step.name} failed: ${reason}\n\nFull output:\n${failedOutput.substring(0, 3000)}`;
                }
                stepAttemptOffsets[step.name] = displayAttempt;
                i = jumpIndex;
                break;
              }
            }
            const retryMsg = `${step.name} failed (attempt ${displayAttempt}/${maxAttempts}): ${reason}. Retrying...`;
            onLog(`\n${retryMsg}\n`);
            if (await updateRunningJob(jobId, { question: retryMsg }) !== 'updated') return;
            await supabase.from('job_logs').insert({ job_id: jobId, event: 'log', data: { text: `[retry] ${retryMsg}` } });
            continue;
          }
          if (failed && displayAttempt >= maxAttempts) {
            if (step.on_max_retries === 'pause') {
              const pauseMsg = `${step.name} still failing after ${maxAttempts} attempts: ${reason}`;
              if (await updateRunningJob(jobId, {
                status: 'paused',
                question: pauseMsg,
                phases_completed: phasesCompleted,
              }) === 'canceled') return;
              await updateTaskStatus(task.id, 'paused');
              onPause(pauseMsg);
              return;
            }
            if (step.on_max_retries === 'fail') {
              const failMsg = `${step.name} failed after ${maxAttempts} attempts: ${reason}`;
              if (await updateRunningJob(jobId, {
                status: 'failed',
                phases_completed: phasesCompleted,
                completed_at: new Date().toISOString(),
                question: failMsg,
              }) === 'canceled') return;
              await updateTaskStatus(task.id, 'failed');
              onFail(failMsg);
              return;
            }
            // 'skip' -- fall through to next step
            onLog(`\n${step.name} failed but on_max_retries=skip, continuing...\n`);
          }
          if (!failed) {
            // Gate passed — clear stale feedback from previous failures
            delete task._gateFeedback;
          }
        }

        i++;
        break;

      } catch (err: any) {
        // If the job was canceled, the cancellation loop handles cleanup — just bail out.
        if (err.message === 'Job canceled') return;

        onLog(`\nError in step ${step.name}: ${err.message}\n`);
        if (displayAttempt >= maxAttempts) {
          if (!await isJobStillRunning(jobId)) return;
          let failMessage = `Step '${step.name}' failed: ${err.message}`;
          try {
            const { revertToCheckpoint } = await import('../checkpoint.js');
            revertToCheckpoint(localPath, jobId);
            onLog('[checkpoint] Auto-reverted changes after failure\n');
            failMessage += '. Changes have been automatically reverted.';
          } catch (revertErr: any) {
            onLog(`[checkpoint] Could not revert: ${revertErr.message}\n`);
            failMessage += '. WARNING: Changes were NOT reverted.';
          }
          if (await updateRunningJob(jobId, {
            status: 'failed',
            phases_completed: phasesCompleted,
            completed_at: new Date().toISOString(),
            question: failMessage,
          }) === 'canceled') return;
          await updateTaskStatus(task.id, 'paused');
          onFail(failMessage);
          return;
        }
      }
    }
  }

  // All steps complete -- generate summary and move to review

  if (!await isJobStillRunning(jobId)) return;

  // Scan .artifacts/ directory for produced files
  if (ctx.task.chaining === 'produce' || ctx.task.chaining === 'both') {
    await scanAndUploadArtifacts(localPath, ctx.taskId, jobId, phasesCompleted[phasesCompleted.length - 1]?.phase || 'unknown', onLog);
  }

  if (!await isJobStillRunning(jobId)) return;

  let { filesChanged, linesAdded, linesRemoved, changedFiles } = { filesChanged: 0, linesAdded: 0, linesRemoved: 0, changedFiles: [] as string[] };
  try {
    ({ filesChanged, linesAdded, linesRemoved, changedFiles } = stagedDiffStat(localPath));
  } catch { /* ignore */ }

  let finalSummary = 'Completed';
  try {
    const phaseLog = phasesCompleted.map((p: any) => {
      const raw = (typeof p.output === 'string' ? p.output : '').split('\n').filter((l: string) => l.trim() && !/^\[/.test(l.trim())).join('\n').trim();
      return `## ${p.phase} (attempt ${p.attempt || 1})\n${raw}`;
    }).join('\n\n');
    const diffInfo = changedFiles.length > 0 ? `Files changed: ${changedFiles.join(', ')} (+${linesAdded} -${linesRemoved})` : `${filesChanged} files changed (+${linesAdded} -${linesRemoved})`;
    const summaryPrompt = `You are summarizing a completed code task for a project dashboard.\n\nTask: ${task.title}\n${diffInfo}\n\nPhase outputs:\n${phaseLog.substring(0, 3000)}\n\nWrite a concise summary (2-4 sentences) of what was done and why. Focus on the actual change, not the process. No markdown formatting, no bullet points. Plain text only.`;
    finalSummary = await summarize({
      jobId,
      step: summaryRuntimeStep(flow),
      cwd: localPath,
      prompt: summaryPrompt,
    });
  } catch (err: any) {
    if (err.message === 'Job canceled') return;
    console.error('[runner] Summary generation failed:', err.message);
    finalSummary = `Completed (summary unavailable: ${err.message})`;
    onLog(`[runner] Summary generation failed, using fallback\n`);
  }

  if (!await isJobStillRunning(jobId)) return;

  const reviewResult = {
    filesChanged,
    // testsPassed is true here because if any gate step had failed beyond max
    // retries, we would have already returned (paused/failed) before reaching
    // this point. Reaching here means all gates passed or were skipped.
    testsPassed: true,
    linesAdded,
    linesRemoved,
    changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    summary: finalSummary,
  };

  if (await markRunningJobForReview(jobId, {
    status: 'review',
    phases_completed: phasesCompleted,
    review_result: reviewResult,
  }) === 'canceled') return;
  await updateTaskStatus(task.id, 'review');
  await onReview(reviewResult);
  await onDone();
}

async function isJobStillRunning(jobId: string): Promise<boolean> {
  const { data, error } = await supabase.from('jobs').select('status').eq('id', jobId).single();
  if (error) {
    console.warn(`[runner] Could not check status for job ${jobId}:`, error.message);
    return true;
  }
  return data?.status === 'running';
}

async function updateTaskStatus(taskId: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status, ...extra }).eq('id', taskId);
  if (error) {
    console.error(`[runner] Failed to update task ${taskId} to ${status}, retrying:`, error.message);
    const { error: retryError } = await supabase.from('tasks').update({ status, ...extra }).eq('id', taskId);
    if (retryError) {
      console.error(`[runner] Retry also failed for task ${taskId}:`, retryError.message);
      throw new Error(`Failed to update task ${taskId} to ${status}: ${retryError.message}`);
    }
  }
}

async function updateRunningJob(jobId: string, payload: Record<string, unknown>): Promise<JobUpdateResult> {
  const { data, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', jobId)
    .eq('status', 'running')
    .select('id');
  if (error) {
    console.error(`[runner] Failed to update running job ${jobId}:`, error.message);
    return 'error';
  }
  return Array.isArray(data) && data.length > 0 ? 'updated' : 'canceled';
}

async function markRunningJobForReview(jobId: string, payload: Record<string, unknown>): Promise<JobUpdateResult> {
  const { data, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', jobId)
    .eq('status', 'running')
    .select('id');
  if (error) {
    console.error(`[runner] Failed to save review for job ${jobId}:`, error.message);
    return 'error';
  }
  return Array.isArray(data) && data.length > 0 ? 'updated' : 'canceled';
}

async function savePhases(jobId: string, phasesCompleted: unknown[]): Promise<void> {
  let { error } = await supabase.from('jobs').update({ phases_completed: phasesCompleted }).eq('id', jobId);
  if (error) {
    console.error(`[runner] Failed to save phases_completed for job ${jobId}, retrying:`, error.message);
    ({ error } = await supabase.from('jobs').update({ phases_completed: phasesCompleted }).eq('id', jobId));
    if (error) console.error(`[runner] Retry also failed for job ${jobId}:`, error.message);
  }
}

/**
 * Clean up orphaned jobs on server startup.
 * Any job with status 'running' that has no active process is orphaned
 * (server was restarted while it was running).
 */
export async function cleanupOrphanedJobs(): Promise<number> {
  const { data: runningJobs } = await supabase
    .from('jobs')
    .select('id, task_id, started_at')
    .in('status', ['running']);

  if (!runningJobs || runningJobs.length === 0) return 0;

  let cleaned = 0;
  for (const job of runningJobs) {
    if (getActiveProcessCount(job.id) === 0) {
      const elapsed = Date.now() - new Date(job.started_at).getTime();
      const elapsedMin = Math.round(elapsed / 60000);

      const failMsg = `Job failed: worker was restarted while this job was running (after ${elapsedMin}m). Click "Run" on the task to retry.`;
      await supabase.from('jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        question: failMsg,
      }).eq('id', job.id);

      const { error: taskErr } = await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
      if (taskErr) {
        console.error(`[runner] Failed to update task ${job.task_id} to paused, retrying:`, taskErr.message);
        const { error: retryErr } = await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
        if (retryErr) {
          console.error(`[runner] Retry also failed for task ${job.task_id}:`, retryErr.message);
          throw new Error(`Failed to update task ${job.task_id} to paused: ${retryErr.message}`);
        }
      }

      // Write to job_logs so SSE clients see the terminal event
      await supabase.from('job_logs').insert({
        job_id: job.id,
        event: 'failed',
        data: { error: failMsg },
      });

      cleaned++;
      console.log(`Cleaned orphaned job ${job.id} (was running for ${elapsedMin}m)`);
    }
  }
  return cleaned;
}

// Test-only: expose private helpers for orchestrator.test.ts.
// Do not use outside tests.
export const __test__ = {
  detectPauseQuestion,
  checkGate,
};
