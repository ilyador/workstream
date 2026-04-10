import { spawn } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { supabase } from './supabase.js';
import { stagedDiff, stagedDiffStat } from './git-utils.js';
import { discoverSkills } from './routes/data.js';
import type { FlowConfig, FlowStepConfig } from './flow-config.js';
import { requireDetectedAiRuntime } from './ai-runtime-discovery.js';
import {
  registerActiveProcess,
  unregisterActiveProcess,
  isJobCanceled,
  getActiveProcessCount,
  cancelJob as cancelJobImpl,
  cancelAllJobs as cancelAllJobsImpl,
} from './process-lifecycle.js';

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
  const { data: taskRow } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
  if (!taskRow?.project_id) {
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
      const storagePath = `${taskRow.project_id}/${taskId}/${filename}`;

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

// ---------------------------------------------------------------------------
// Flow-based execution (new system — composable AI flows)
// ---------------------------------------------------------------------------
export type { FlowConfig, FlowStepConfig } from './flow-config.js';

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

function formatRagResults(results: any[]): string {
  let out = '## Document Search Results\nThe following passages were found relevant to your question:\n\n';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    out += `[${i + 1}] From "${r.file_name}" (${(r.similarity * 100).toFixed(1)}% match):\n${r.content}\n\n`;
  }
  return out;
}

/** Build prompt for a single flow step, including only the requested context sources. */
export async function buildStepPrompt(
  step: FlowStepConfig,
  flow: FlowConfig,
  task: any,
  previousOutputs: any[],
  localPath: string,
  answer?: string,
): Promise<string> {
  let prompt = 'You are working on a task in this project\'s codebase.\n\n';

  if (flow.agents_md) {
    prompt += `## Agent Instructions\n${flow.agents_md.substring(0, 8000)}\n\n`;
  }

  for (const source of step.context_sources) {
    switch (source) {
      case 'agents': {
        const agentPaths = [join(localPath, 'AGENTS.md'), join(localPath, 'CLAUDE.md')];
        for (const agentPath of agentPaths) {
          if (!existsSync(agentPath)) continue;
          const content = readFileSync(agentPath, 'utf-8');
          prompt += `## Repository Instructions\n${content.substring(0, 8000)}\n\n`;
          break;
        }
        break;
      }
      case 'task_description':
        prompt += `## Task\nTitle: ${task.title}\nDescription: ${task.description || 'No description provided.'}\n\n`;
        break;
      case 'task_images':
        if (Array.isArray(task.images) && task.images.length > 0) {
          prompt += '## Attached Images\n';
          for (const url of task.images) prompt += `${url}\n`;
          prompt += '\n';
        }
        break;
      case 'skills':
        if (task.description) {
          const skillRefs = [...task.description.matchAll(/(?:^|[\s\n])\/([a-zA-Z0-9_][\w:-]*)/g)].map(m => m[1]);
          if (skillRefs.length > 0) {
            const available = discoverSkills(localPath);
            const skillMap = new Map(available.map(s => [s.name, s]));
            const verified = skillRefs.filter(name => skillMap.has(name));
            if (verified.length > 0) {
              prompt += '## Skills to Apply\n';
              for (const name of verified) {
                const skill = skillMap.get(name)!;
                try {
                  let content = readFileSync(skill.filePath, 'utf-8');
                  content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
                  if (content.length > 8000) content = content.substring(0, 8000) + '\n...(truncated)';
                  prompt += `\n### Skill: /${name}\n${content}\n`;
                } catch {
                  prompt += `\n### Skill: /${name}\nInvoke this skill using the Skill tool: /${name}\n`;
                }
              }
              prompt += '\n';
            }
          }
        }
        break;
      case 'followup_notes':
        if (task.followup_notes) {
          prompt += `## Rework Feedback\n${task.followup_notes}\n\n`;
          // Include task's own artifacts so the AI can revise them
          const { data: ownArtifacts } = await supabase
            .from('task_artifacts').select('*').eq('task_id', task.id).order('created_at');
          if (ownArtifacts && ownArtifacts.length > 0) {
            prompt += '## Previously Generated Files\n';
            for (const a of ownArtifacts) {
              if (a.mime_type.startsWith('text/') || a.mime_type === 'application/json') {
                const { data: fileData } = await supabase.storage.from('task-artifacts').download(a.storage_path);
                if (fileData) {
                  const content = await fileData.text();
                  prompt += `### ${a.filename}\n\`\`\`\n${content}\n\`\`\`\n\n`;
                }
              } else {
                prompt += `- ${a.filename} (${a.mime_type})\n`;
              }
            }
            prompt += 'Revise these files based on the feedback above.\n\n';
          }
        }
        break;
      case 'architecture_md': {
        const archPaths = [join(localPath, 'ARCHITECTURE.md'), join(localPath, 'docs', 'ARCHITECTURE.md')];
        for (const archPath of archPaths) {
          if (existsSync(archPath)) {
            try {
              prompt += `## Architecture Reference\n${readFileSync(archPath, 'utf-8').substring(0, 8000)}\n\n`;
            } catch { /* ignore */ }
            break;
          }
        }
        break;
      }
      case 'review_criteria': {
        const configPath = join(localPath, '.codesync', 'config.json');
        if (existsSync(configPath)) {
          try {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            if (config.review_criteria && Array.isArray(config.review_criteria.rules) && config.review_criteria.rules.length > 0) {
              prompt += '## Review Criteria\n';
              for (const rule of config.review_criteria.rules) prompt += `- ${rule}\n`;
              prompt += '\n';
            }
          } catch { /* ignore */ }
        }
        break;
      }
      case 'git_diff': {
        try {
          // Stage temporarily so untracked (new) files appear in the diff
          const diff = stagedDiff(localPath);
          if (diff) {
            prompt += `## Git Diff (changes made)\n\`\`\`diff\n${diff.substring(0, 12000)}\n\`\`\`\n\n`;
          }
        } catch { /* ignore */ }
        break;
      }
      case 'previous_step':
        if (previousOutputs.length > 0) {
          const last = previousOutputs[previousOutputs.length - 1];
          prompt += `## Previous Step: ${last.phase}\n${typeof last.output === 'string' ? last.output : JSON.stringify(last.output, null, 2)}\n\n`;
        }
        break;
      case 'gate_feedback':
        if (task._gateFeedback) {
          prompt += `## Previous Step Feedback (retry reason)\n${task._gateFeedback}\n\n`;
        }
        break;
      case 'all_previous_steps':
        if (previousOutputs.length > 0) {
          prompt += '## Previous Phase Outputs\n';
          for (const po of previousOutputs) {
            prompt += `### ${po.phase} (attempt ${po.attempt})\n${typeof po.output === 'string' ? po.output : JSON.stringify(po.output, null, 2)}\n\n`;
          }
        }
        break;
      case 'previous_artifacts': {
        // Get artifacts from the previous task in the workstream
        const { data: currentTask } = await supabase
          .from('tasks')
          .select('workstream_id, position')
          .eq('id', task.id)
          .single();

        if (currentTask?.workstream_id) {
          // Find completed tasks earlier in the workstream
          const { data: prevTasks } = await supabase
            .from('tasks')
            .select('id, title')
            .eq('workstream_id', currentTask.workstream_id)
            .eq('status', 'done')
            .lt('position', currentTask.position)
            .order('position', { ascending: false })
            .limit(1);

          if (prevTasks && prevTasks.length > 0) {
            const prevTask = prevTasks[0];
            const { data: artifacts } = await supabase
              .from('task_artifacts')
              .select('*')
              .eq('task_id', prevTask.id)
              .order('created_at');

            if (artifacts && artifacts.length > 0) {
              prompt += '\n## Artifacts from previous task\n';
              prompt += `Previous task: "${prevTask.title}"\n\n`;
              for (const a of artifacts) {
                const { data: urlData } = supabase.storage.from('task-artifacts').getPublicUrl(a.storage_path);
                const url = urlData.publicUrl;

                // For text files, inline the content
                if (a.mime_type.startsWith('text/') || a.mime_type === 'application/json') {
                  try {
                    const { data: fileData } = await supabase.storage.from('task-artifacts').download(a.storage_path);
                    if (fileData) {
                      const text = await fileData.text();
                      prompt += `### ${a.filename}\n\`\`\`\n${text.substring(0, 5000)}\n\`\`\`\n\n`;
                    }
                  } catch {
                    prompt += `- ${a.filename} (${a.mime_type}): ${url}\n`;
                  }
                } else {
                  // For images and binary, provide URL
                  prompt += `- ${a.filename} (${a.mime_type}): ${url}\n`;
                }
              }
              prompt += '\n';
            }
          }
        }
        break;
      }
    }
  }

  if (step.use_project_data && task.allow_project_data) {
    if (task._projectDataResults?.length > 0) prompt += formatRagResults(task._projectDataResults);
    if (step.tools.includes('Bash')) {
      prompt += `## Project Data Search Tool\nYou can search indexed project documents using the Bash tool:\n\`\`\`\nnpx tsx src/server/rag-cli.ts ${task.project_id} "your search query"\n\`\`\`\nUse targeted queries to find architecture, specs, docs, lore, or any other indexed project knowledge.\n\n`;
    } else {
      prompt += '## Project Data Search Tool\nThis step can use any Project Data results already included above, but it cannot run additional Project Data searches because the Bash tool is disabled for this step.\n\n';
    }
  }

  // Multi-agent injection
  if (task.multiagent === 'yes') {
    prompt += '## Multi-Agent Mode\nUse subagents to parallelize this work. Dispatch separate agents for independent subtasks.\n\n';
  }

  // Artifact acceptance hint for first step
  if (
    (task.chaining === 'accept' || task.chaining === 'both') &&
    previousOutputs.length === 0
  ) {
    prompt += '## Artifact Context\nThe artifacts from the previous task are provided above. Use them as context for your work.\n\n';
  }

  // Step instructions (the core prompt for this step)
  prompt += `## Current Step: ${step.name}\n${step.instructions}\n\n`;

  // File output instruction for tasks that produce artifacts
  if (task.chaining === 'produce' || task.chaining === 'both') {
    prompt += '## File Output\nIf you produce any output files (documents, images, configs, etc.), save them to the `.artifacts/` directory in the project root. They will be automatically captured and made available for download.\n\n';
  }

  // Human answer (if resuming from pause)
  if (answer) {
    prompt += `## Human Answer to Your Question\n${answer}\n\n`;
  }

  prompt += 'If you need clarification from the human, clearly state your question and stop.\n';
  prompt += '\nAt the very end of your response, write a one-line summary of what you did in this step using this exact format:\n[summary] Your short summary here\n';

  return prompt;
}

function buildClaudeArgs(step: FlowStepConfig, task: { effort?: string | null }): string[] {
  const args = ['-p', '--verbose', '--output-format', 'stream-json'];
  if (step.tools.length > 0) {
    args.push('--allowedTools', step.tools.join(','));
    const writeTools = ['Edit', 'Write', 'NotebookEdit'];
    const blocked = writeTools.filter(tool => !step.tools.includes(tool));
    if (blocked.length > 0) args.push('--disallowedTools', blocked.join(','));
  }
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  if (task.effort) args.push('--effort', task.effort);
  return args;
}

function codexEffortLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === 'max' ? 'xhigh' : value;
}

function buildCodexArgs(step: FlowStepConfig, task: { effort?: string | null }, cwd: string, outputPath: string): string[] {
  const args = [
    'exec',
    '--json',
    '--cd', cwd,
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-last-message', outputPath,
    '-',
  ];
  if (step.runtime_variant) args.splice(args.length - 1, 0, '--model', step.runtime_variant);
  const effort = codexEffortLevel(task.effort);
  if (effort) args.splice(args.length - 1, 0, '-c', `model_reasoning_effort="${effort}"`);
  return args;
}

function buildQwenArgs(step: FlowStepConfig, _task: { effort?: string | null }, prompt: string): string[] {
  const args = [
    '--prompt', prompt,
    '--output-format', 'text',
    '--approval-mode', 'yolo',
  ];
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  return args;
}

async function runStepWithRuntime(
  jobId: string,
  step: FlowStepConfig,
  task: { effort?: string | null },
  localPath: string,
  onLog: (text: string) => void,
  prompt: string,
): Promise<string> {
  const runtime = requireDetectedAiRuntime(step.runtime_id);
  switch (runtime.id) {
    case 'claude_code':
      return spawnClaude(jobId, buildClaudeArgs(step, task), localPath, onLog, prompt);
    case 'codex':
      return spawnCodex(jobId, buildCodexArgs(step, task, localPath, join(tmpdir(), `workstream-codex-${jobId}-${Date.now()}.txt`)), localPath, onLog, prompt);
    case 'qwen_code':
      return spawnQwen(jobId, buildQwenArgs(step, task, prompt), localPath, onLog);
    default:
      throw new Error(`Runtime driver not implemented: ${runtime.id}`);
  }
}

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
        const output = await runStepWithRuntime(jobId, step, task, localPath, onLog, prompt);
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
        // Filter out RULES/instruction lines to avoid false-positive pause detection
        const candidateLines = output.trim().split('\n').slice(-5).filter(l => {
          const trimmed = l.trim();
          return !trimmed.startsWith('- ') && !trimmed.startsWith('RULES:') && !trimmed.startsWith('IMPORTANT:');
        });
        const lastLines = candidateLines.join('\n');
        if (lastLines.includes('?') && (lastLines.includes('Should I') || lastLines.includes('Could you') || lastLines.includes('Which') || lastLines.includes('clarif'))) {
          if (await updateRunningJob(jobId, {
            status: 'paused',
            question: lastLines,
            phases_completed: phasesCompleted,
          }) === 'canceled') return;
          await updateTaskStatus(task.id, 'paused');
          onPause(lastLines);
          return;
        }

        // Gate check (verify/review steps)
        if (step.is_gate) {
          const verdict = extractVerdict(output);
          if (!verdict) console.warn(`[runner] Job ${jobId}: gate step '${step.name}' returned no structured verdict, using legacy heuristics`);
          const isReview = step.name === 'review' || step.context_sources.includes('review_criteria');
          const failed = verdict ? !verdict.passed : (isReview ? legacyReviewCheck(output) : legacyVerifyCheck(output));
          const reason = verdict?.reason || `${step.name} failed (see output)`;

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
            const { revertToCheckpoint } = await import('./checkpoint.js');
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
    finalSummary = await generateSummary(jobId, summaryPrompt, summaryRuntimeStep(flow), localPath);
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

// --- Structured verdict parsing for verify/review phases ---

interface PhaseVerdict {
  passed: boolean;
  reason: string;
}

/** Extract a one-sentence summary from a phase's raw output. */
function extractPhaseSummary(rawOutput: string): string {
  // Prefer the explicit [summary] tag the LLM was asked to produce
  const match = rawOutput.match(/\[summary]\s*(.+)/i);
  if (match) {
    const summary = match[1].trim();
    return summary.length > 200 ? summary.substring(0, 197) + '...' : summary;
  }

  // Fallback: last meaningful line, with markdown stripped
  const lines = rawOutput.split('\n').filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (/^\[/.test(t)) return false;
    if (t.startsWith('---') || t.startsWith('```') || t.startsWith('#')) return false;
    if (/^[*=]{3,}$/.test(t)) return false;
    if (t.startsWith('RULES:') || t.startsWith('IMPORTANT:')) return false;
    return true;
  });
  let last = lines[lines.length - 1]?.trim() || '';
  last = last.replace(/^[-*]\s+/, '').replace(/^`+|`+$/g, '');
  return last.length > 200 ? last.substring(0, 197) + '...' : last;
}

/** Extract the last JSON verdict block from Claude's output. */
function extractVerdict(output: string): PhaseVerdict | null {
  const fenced = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let last: PhaseVerdict | null = null;
  let m;
  while ((m = fenced.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (typeof parsed.passed === 'boolean') {
        last = { passed: parsed.passed, reason: parsed.reason || '' };
      }
    } catch { /* skip */ }
  }
  if (last) return last;
  const lines = output.trim().split('\n');
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.passed === 'boolean') {
          return { passed: parsed.passed, reason: parsed.reason || '' };
        }
      } catch { /* skip */ }
    }
  }
  return null;
}

function legacyVerifyCheck(output: string): boolean {
  // Only check the last 20 lines (actual test results), not the full output
  // which includes the echoed prompt/RULES that contain words like "failing tests".
  const tail = output.trim().split('\n').slice(-20).join('\n');
  const lower = tail.toLowerCase();
  const hasFail = /\bfail\b|tests?\s+fail/.test(lower);
  const hasError = lower.includes('error') || lower.includes('not passing');
  const excluded = lower.includes('no failures') || lower.includes('0 failed') || lower.includes('fixed');
  return (hasFail || hasError) && !excluded;
}

function legacyReviewCheck(output: string): boolean {
  const lower = output.toLowerCase();
  const hasIssues = /issues?\s+found/.test(lower);
  const hasFail = lower.includes('fail') || lower.includes('problem') || lower.includes('reject');
  const excluded = lower.includes('no issues found') || lower.includes('no issues') || lower.includes('0 issues');
  return (hasIssues || hasFail) && !excluded;
}

/** Shared env for spawned claude processes. Ensures PATH includes ~/.local/bin for systemd. */
export const claudeEnv = {
  ...process.env,
  TERM: 'dumb',
  PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
};

export const cancelJob = cancelJobImpl;
export const cancelAllJobs = cancelAllJobsImpl;



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

      await updateTaskStatus(job.task_id, 'paused');

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

async function isJobStillRunning(jobId: string): Promise<boolean> {
  const { data, error } = await supabase.from('jobs').select('status').eq('id', jobId).single();
  if (error) {
    console.warn(`[runner] Could not check status for job ${jobId}:`, error.message);
    return true;
  }
  return data?.status === 'running';
}

type JobUpdateResult = 'updated' | 'canceled' | 'error';

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

function formatStreamEvent(event: any): string | null {
  // Handle assistant messages with content blocks
  if (event.type === 'assistant' && event.message?.content) {
    const parts: string[] = [];
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      }
      if (block.type === 'tool_use') {
        const toolName = block.name || 'unknown';
        const input = block.input || {};
        if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
          parts.push(`[${toolName}] ${input.file_path || input.pattern || input.path || ''}`);
        } else if (toolName === 'Edit' || toolName === 'Write') {
          parts.push(`[${toolName}] ${input.file_path || ''}`);
        } else if (toolName === 'Bash') {
          const cmd = (input.command || '').substring(0, 100);
          parts.push(`[Bash] ${cmd}`);
        } else {
          parts.push(`[${toolName}]`);
        }
      }
    }
    return parts.join('\n') || null;
  }

  // Handle result event (final summary)
  if (event.type === 'result') {
    const duration = event.duration_ms ? ` (${(event.duration_ms / 1000).toFixed(1)}s)` : '';
    return `[done] Phase complete${duration}`;
  }

  // Skip tool_result / tool_output to avoid noise
  if (event.type === 'tool_result' || event.type === 'tool_output') {
    return null;
  }

  return null;
}

/** Quick runtime call for generating summaries. No tools, just text in/out. */
function generateSummary(jobId: string, prompt: string, step: FlowStepConfig, cwd: string): Promise<string> {
  const runtime = requireDetectedAiRuntime(step.runtime_id);
  switch (runtime.id) {
    case 'claude_code':
      return new Promise((resolve, reject) => {
        const model = step.runtime_variant || 'sonnet';
        const proc = spawn('claude', ['-p', '--output-format', 'text', '--max-turns', '1', '--model', model], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: claudeEnv,
          timeout: 30000,
        });

        registerActiveProcess(jobId, proc);
        let stdout = '';
        proc.stdin.write(prompt);
        proc.stdin.end();
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.on('close', (code) => {
          const wasCanceled = isJobCanceled(jobId);
          unregisterActiveProcess(jobId, proc);
          if (wasCanceled) {
            reject(new Error('Job canceled'));
            return;
          }
          if (code === 0 || code === null) resolve(stdout.trim() || 'Completed');
          else reject(new Error(`summary claude exited with code ${code}`));
        });
        proc.on('error', (err) => {
          unregisterActiveProcess(jobId, proc);
          reject(err);
        });
      });
    case 'codex':
      return spawnCodex(
        jobId,
        buildCodexArgs(step, { effort: null }, cwd, join(tmpdir(), `workstream-codex-summary-${jobId}-${Date.now()}.txt`)),
        cwd,
        () => {},
        prompt,
      );
    case 'qwen_code':
      return spawnQwen(jobId, buildQwenArgs(step, { effort: null }, prompt), cwd, () => {});
    default:
      return Promise.reject(new Error(`Summary runtime not implemented: ${step.runtime_id}`));
  }
}

const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes per Claude call

function spawnClaude(jobId: string, args: string[], cwd: string, onLog: (text: string) => void, prompt?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: claudeEnv,
    });

    registerActiveProcess(jobId, proc);
    let fullOutput = '';

    // Kill process if it exceeds the timeout
    const timeout = setTimeout(() => {
      onLog(`[runner] Process timed out after ${JOB_TIMEOUT_MS / 60000}m — killing\n`);
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* already dead */ } }, 5000);
    }, JOB_TIMEOUT_MS);
    let lineBuffer = '';

    // Pipe prompt via stdin to avoid arg length limits
    proc.stdin.on('error', (err) => {
      console.error(`[runner] stdin write error for job ${jobId}:`, err.message);
    });
    if (prompt) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      lineBuffer += text;

      // Process complete lines (stream-json sends one JSON object per line)
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const formatted = formatStreamEvent(event);
          if (formatted) {
            fullOutput += formatted + '\n';
            onLog(formatted + '\n');
          }
        } catch {
          // Not JSON, log raw
          fullOutput += line + '\n';
          onLog(line + '\n');
        }
      }
    });

    let stderrBuffer = '';
    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      if (!text.includes('stdin') && !text.includes('Warning')) {
        onLog(text);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      // Process remaining buffer
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer);
          const formatted = formatStreamEvent(event);
          if (formatted) fullOutput += formatted + '\n';
        } catch {
          fullOutput += lineBuffer;
        }
      }
      // If cancelJob() already removed this jobId from activeProcesses, the
      // process was killed intentionally — reject so the runner stops.
      const wasCanceled = isJobCanceled(jobId);
      unregisterActiveProcess(jobId, proc);
      if (wasCanceled) {
        reject(new Error('Job canceled'));
        return;
      }
      // If claude streamed a result event but exited non-zero, treat as success.
      // The CLI sometimes exits 1 after completing successfully (e.g. max turns reached).
      const hasResult = fullOutput.includes('[done] Phase complete');
      if (code === 0 || code === null || hasResult) {
        resolve(fullOutput);
      } else {
        // Include stderr in error for diagnosability
        const stderrClean = stderrBuffer.trim().split('\n')
          .filter(l => !l.includes('stdin') && !l.includes('Warning'))
          .slice(-10).join('\n');
        const detail = stderrClean ? `\n${stderrClean}` : '';
        reject(new Error(`claude exited with code ${code}${detail}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      unregisterActiveProcess(jobId, proc);
      reject(err);
    });
  });
}

function spawnCodex(jobId: string, args: string[], cwd: string, onLog: (text: string) => void, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputIndex = args.findIndex(arg => arg === '--output-last-message');
    const outputPath = outputIndex >= 0 && typeof args[outputIndex + 1] === 'string'
      ? args[outputIndex + 1]
      : join(tmpdir(), `workstream-codex-${jobId}-${Date.now()}.txt`);
    const proc = spawn('codex', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: claudeEnv,
    });

    registerActiveProcess(jobId, proc);
    let stdoutBuffer = '';
    let stderrBuffer = '';

    proc.stdin.on('error', () => {});
    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          const message = typeof event.msg === 'string' ? event.msg
            : typeof event.message === 'string' ? event.message
            : typeof event.text === 'string' ? event.text
            : (typeof event.type === 'string' && typeof event.command === 'string' ? `[${event.type}] ${event.command}` : null);
          if (message) onLog(`${message}\n`);
        } catch {
          onLog(`${line}\n`);
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      if (text.trim()) onLog(text);
    });

    proc.on('close', (code) => {
      unregisterActiveProcess(jobId, proc);
      if (isJobCanceled(jobId)) {
        reject(new Error('Job canceled'));
        return;
      }

      let output = '';
      try {
        output = readFileSync(outputPath, 'utf8').trim();
      } catch {
        output = '';
      }
      try { unlinkSync(outputPath); } catch { /* ignore */ }

      if (code === 0 || code === null) {
        resolve(output || 'Completed');
        return;
      }

      const stderrClean = stderrBuffer.trim().split('\n').slice(-10).join('\n');
      const detail = stderrClean ? `\n${stderrClean}` : '';
      reject(new Error(`codex exited with code ${code}${detail}`));
    });

    proc.on('error', (error) => {
      unregisterActiveProcess(jobId, proc);
      reject(error);
    });
  });
}

function spawnQwen(jobId: string, args: string[], cwd: string, onLog: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('qwen', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: claudeEnv,
    });

    registerActiveProcess(jobId, proc);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (text.trim()) onLog(text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (text.trim()) onLog(text);
    });

    proc.on('close', (code) => {
      unregisterActiveProcess(jobId, proc);
      if (isJobCanceled(jobId)) {
        reject(new Error('Job canceled'));
        return;
      }
      if (code === 0 || code === null) {
        resolve(stdout.trim() || 'Completed');
        return;
      }
      const detail = stderr.trim().split('\n').slice(-10).join('\n');
      reject(new Error(`qwen exited with code ${code}${detail ? `\n${detail}` : ''}`));
    });

    proc.on('error', (error) => {
      unregisterActiveProcess(jobId, proc);
      reject(error);
    });
  });
}
