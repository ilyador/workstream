import { spawn, ChildProcess, execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { supabase, savePhases } from './supabase.js';
import { stagedDiff, stagedDiffStat } from './git-utils.js';
import { discoverSkills } from './routes/data.js';

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

  for (const filename of files) {
    const filePath = join(artifactsDir, filename);
    try {
      const fileStat = statSync(filePath);
      if (!fileStat.isFile()) continue;
      const fileBuffer = readFileSync(filePath);
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const storagePath = `${taskRow.project_id}/${taskId}/${filename}`;

      await supabase.storage.from('task-artifacts').upload(storagePath, fileBuffer, {
        contentType: mimeType, upsert: true,
      });
      await supabase.from('task_artifacts').insert({
        task_id: taskId, job_id: jobId, phase: lastPhase,
        filename, mime_type: mimeType, size_bytes: fileStat.size, storage_path: storagePath,
      });
      onLog(`[artifact] Captured: ${filename} (${mimeType}, ${fileStat.size} bytes)\n`);
    } catch (err: any) {
      onLog(`[artifact] Failed to capture ${filename}: ${err.message}\n`);
    }
  }
  // Clean up
  try { rmSync(artifactsDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

interface PhaseConfig {
  skill: string | null;
  tools: string[];
  prompt: string;
  model: string;
}

interface TaskTypeConfig {
  phases: string[];
  on_verify_fail: string;
  verify_retries: number;
  final: string;
  on_review_fail: string;
  review_retries: number;
  on_max_retries: string;
  phase_config: Record<string, PhaseConfig>;
}

interface JobContext {
  jobId: string;
  taskId: string;
  projectId: string;
  localPath: string;
  task: any;
  taskType: TaskTypeConfig;
  phasesAlreadyCompleted: any[];
  onLog: (text: string) => void;
  onPhaseStart: (phase: string, attempt: number) => void;
  onPhaseComplete: (phase: string, output: any) => void;
  onPause: (question: string) => void;
  onReview: (result: any) => Promise<void> | void;
  onDone: () => Promise<void> | void;
  onFail: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Flow-based execution (new system — composable AI flows)
// ---------------------------------------------------------------------------

export interface FlowStepConfig {
  position: number;
  name: string;
  instructions: string;
  model: string;
  tools: string[];
  context_sources: string[];
  is_gate: boolean;
  on_fail_jump_to: number | null;
  max_retries: number;
  on_max_retries: 'pause' | 'fail' | 'skip';
  include_agents_md: boolean;
}

export interface FlowConfig {
  flow_name: string;
  agents_md: string | null;
  steps: FlowStepConfig[];
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

/** Build a flow_snapshot from a flow + its steps (called at queue time). */
export function buildFlowSnapshot(flow: any): FlowConfig {
  const steps = (flow.flow_steps || [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((s: any) => ({
      position: s.position,
      name: s.name,
      instructions: s.instructions || '',
      model: s.model || 'opus',
      tools: s.tools || [],
      context_sources: s.context_sources || ['task_description', 'previous_step'],
      is_gate: s.is_gate || false,
      on_fail_jump_to: s.on_fail_jump_to ?? null,
      max_retries: s.max_retries ?? 0,
      on_max_retries: s.on_max_retries || 'pause',
      include_agents_md: s.include_agents_md !== false,
    }));
  return {
    flow_name: flow.name,
    agents_md: flow.agents_md || null,
    steps,
  };
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

  // Agents.md -- always injected if the flow has it (applies to all steps)
  if (flow.agents_md) {
    prompt += `## Agent Instructions\n${flow.agents_md.substring(0, 8000)}\n\n`;
  }

  for (const source of step.context_sources) {
    switch (source) {
      case 'claude_md': {
        const claudeMdPath = join(localPath, 'CLAUDE.md');
        if (existsSync(claudeMdPath)) {
          const content = readFileSync(claudeMdPath, 'utf-8');
          prompt += `## Project Context (from CLAUDE.md)\n${content.substring(0, 8000)}\n\n`;
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
      case 'rag':
        if (task._ragResults?.length > 0) prompt += formatRagResults(task._ragResults);
        prompt += `## Document Search Tool\nYou can search project documents for specific information using the Bash tool:\n\`\`\`\nnpx tsx src/server/rag-cli.ts ${task.project_id} "your search query"\n\`\`\`\nUse targeted queries to find rules, lore, specs, or any project documentation. You can run multiple searches.\n\n`;
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

  return prompt;
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

      await supabase.from('jobs').update({
        current_phase: step.name,
        attempt: displayAttempt,
        question: null,
      }).eq('id', jobId);

      const prompt = await buildStepPrompt(step, flow, task, phasesCompleted, localPath, task.answer);

      // Build claude args
      const args = ['-p', '--verbose', '--output-format', 'stream-json'];
      if (step.tools.length > 0) {
        args.push('--allowedTools', step.tools.join(','));
        const writeTools = ['Edit', 'Write', 'NotebookEdit'];
        const blocked = writeTools.filter(t => !step.tools.includes(t));
        if (blocked.length > 0) args.push('--disallowedTools', blocked.join(','));
      }
      if (step.model) args.push('--model', step.model);
      if (task.effort) args.push('--effort', task.effort);

      onLog(`\n--- Step: ${step.name} (attempt ${displayAttempt}/${maxAttempts}) ---\n`);

      try {
        const output = await spawnClaude(jobId, args, localPath, onLog, prompt);

        const phaseOutput = {
          phase: step.name,
          attempt,
          output: output.substring(0, 10000),
          summary: extractPhaseSummary(output),
        };
        phasesCompleted.push(phaseOutput);
        await savePhases(jobId, phasesCompleted);
        onPhaseComplete(step.name, phaseOutput);

        // Check if claude asked a question
        // Filter out RULES/instruction lines to avoid false-positive pause detection
        const candidateLines = output.trim().split('\n').slice(-5).filter(l => {
          const trimmed = l.trim();
          return !trimmed.startsWith('- ') && !trimmed.startsWith('RULES:') && !trimmed.startsWith('IMPORTANT:');
        });
        const lastLines = candidateLines.join('\n');
        if (lastLines.includes('?') && (lastLines.includes('Should I') || lastLines.includes('Could you') || lastLines.includes('Which') || lastLines.includes('clarif'))) {
          await supabase.from('jobs').update({
            status: 'paused',
            question: lastLines,
            phases_completed: phasesCompleted,
          }).eq('id', jobId);
          await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
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
                const retryMsg = `${step.name} failed (attempt ${displayAttempt}/${maxAttempts}): ${reason}. Retrying from '${steps[jumpIndex].name}'...`;
                onLog(`\n${retryMsg}\n`);
                await supabase.from('jobs').update({ question: retryMsg }).eq('id', jobId);
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
            await supabase.from('jobs').update({ question: retryMsg }).eq('id', jobId);
            await supabase.from('job_logs').insert({ job_id: jobId, event: 'log', data: { text: `[retry] ${retryMsg}` } });
            continue;
          }
          if (failed && displayAttempt >= maxAttempts) {
            if (step.on_max_retries === 'pause') {
              const pauseMsg = `${step.name} still failing after ${maxAttempts} attempts: ${reason}`;
              await supabase.from('jobs').update({
                status: 'paused',
                question: pauseMsg,
                phases_completed: phasesCompleted,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onPause(pauseMsg);
              return;
            }
            if (step.on_max_retries === 'fail') {
              const failMsg = `${step.name} failed after ${maxAttempts} attempts: ${reason}`;
              await supabase.from('jobs').update({
                status: 'failed',
                phases_completed: phasesCompleted,
                completed_at: new Date().toISOString(),
                question: failMsg,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onFail(failMsg);
              return;
            }
            // 'skip' -- fall through to next step
            onLog(`\n${step.name} failed but on_max_retries=skip, continuing...\n`);
          }
        }

        i++;
        break;

      } catch (err: any) {
        // If the job was canceled, the cancellation loop handles cleanup — just bail out.
        if (err.message === 'Job canceled') return;

        onLog(`\nError in step ${step.name}: ${err.message}\n`);
        if (attempt >= maxAttempts) {
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
          await supabase.from('jobs').update({
            status: 'failed',
            phases_completed: phasesCompleted,
            completed_at: new Date().toISOString(),
            question: failMessage,
          }).eq('id', jobId);
          await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
          onFail(failMessage);
          return;
        }
      }
    }
  }

  // All steps complete -- generate summary and move to review

  // Scan .artifacts/ directory for produced files
  if (ctx.task.chaining === 'produce' || ctx.task.chaining === 'both') {
    await scanAndUploadArtifacts(localPath, ctx.taskId, jobId, phasesCompleted[phasesCompleted.length - 1]?.phase || 'unknown', onLog);
  }

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
    finalSummary = await generateSummary(summaryPrompt);
  } catch (err: any) {
    console.error('[runner] Summary generation failed:', err.message);
  }

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

  const { error: reviewErr } = await supabase.from('jobs').update({
    status: 'review',
    phases_completed: phasesCompleted,
    review_result: reviewResult,
  }).eq('id', jobId);
  if (reviewErr) console.error(`[runner] Failed to save review for job ${jobId}:`, reviewErr.message);
  await supabase.from('tasks').update({ status: 'review' }).eq('id', task.id);
  await onReview(reviewResult);
  await onDone();
}

// ---------------------------------------------------------------------------
// Legacy task-type-based execution (kept for backward compatibility)
// ---------------------------------------------------------------------------

// Default task type configs (used when .codesync/config.json doesn't exist)
const DEFAULT_TASK_TYPES: Record<string, TaskTypeConfig> = {
  'bug-fix': {
    phases: ['plan', 'analyze', 'fix', 'verify'],
    on_verify_fail: 'fix',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'fix',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      plan: { skill: null, tools: ['Read', 'Grep', 'Glob'], prompt: '', model: 'opus' },
      analyze: { skill: null, tools: ['Read', 'Grep', 'Bash'], prompt: '', model: 'opus' },
      fix: { skill: null, tools: ['Read', 'Edit', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'feature': {
    phases: ['plan', 'implement', 'verify'],
    on_verify_fail: 'implement',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'implement',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      plan: { skill: null, tools: ['Read', 'Grep', 'Glob'], prompt: '', model: 'opus' },
      implement: { skill: null, tools: ['Read', 'Edit', 'Write', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'refactor': {
    phases: ['plan', 'analyze', 'refactor', 'verify'],
    on_verify_fail: 'refactor',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'refactor',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      plan: { skill: null, tools: ['Read', 'Grep', 'Glob'], prompt: '', model: 'opus' },
      analyze: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'opus' },
      refactor: { skill: null, tools: ['Read', 'Edit', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'test': {
    phases: ['plan', 'write-tests', 'verify'],
    on_verify_fail: 'write-tests',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'write-tests',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      plan: { skill: null, tools: ['Read', 'Grep', 'Glob'], prompt: '', model: 'opus' },
      'write-tests': { skill: null, tools: ['Read', 'Write', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'doc-search': {
    phases: ['answer'],
    on_verify_fail: 'answer',
    verify_retries: 0,
    final: 'answer',
    on_review_fail: 'answer',
    review_retries: 0,
    on_max_retries: 'pause',
    phase_config: {
      answer: { skill: null, tools: ['Read', 'Grep', 'Glob'], prompt: '', model: 'sonnet' },
    },
  },
};

function loadTaskTypeConfig(localPath: string, taskType: string): TaskTypeConfig {
  const configPath = join(localPath, '.codesync', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.task_types?.[taskType]) return config.task_types[taskType];
    } catch { /* fall through to defaults */ }
  }
  return DEFAULT_TASK_TYPES[taskType] || DEFAULT_TASK_TYPES['feature'];
}

async function buildPrompt(phase: string, task: any, previousOutputs: any[], localPath: string, phaseConfig: PhaseConfig, taskType: TaskTypeConfig, answer?: string): Promise<string> {
  // Inject project context from CLAUDE.md if it exists
  let projectContext = '';
  const claudeMdPath = join(localPath, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    projectContext = `## Project Context (from CLAUDE.md)\n${content.substring(0, 8000)}\n\n`;
  }

  let prompt = `You are working on a task in this project's codebase.

${projectContext}## Task
Title: ${task.title}
Type: ${task.type}
Description: ${task.description || 'No description provided.'}
`;

  // RAG context injection for doc-search flow
  if (task._ragResults?.length > 0) prompt += '\n' + formatRagResults(task._ragResults);

  // Skill references: parse /skillname from description, verify they exist, inject content
  if (task.description) {
    const skillRefs = [...task.description.matchAll(/(?:^|[\s\n])\/([a-zA-Z0-9_][\w:-]*)/g)]
      .map(m => m[1]);
    if (skillRefs.length > 0) {
      const available = discoverSkills(localPath);
      const skillMap = new Map(available.map(s => [s.name, s]));
      const verified = skillRefs.filter(name => skillMap.has(name));
      if (verified.length > 0) {
        prompt += '\n## Skills to Apply\n';
        for (const name of verified) {
          const skill = skillMap.get(name)!;
          try {
            let content = readFileSync(skill.filePath, 'utf-8');
            // Strip YAML frontmatter
            content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
            content = content.trim();
            if (content.length > 8000) content = content.substring(0, 8000) + '\n...(truncated)';
            prompt += `\n### Skill: /${name}\n${content}\n`;
          } catch {
            // File unreadable — fall back to invocation instruction
            prompt += `\n### Skill: /${name}\nInvoke this skill using the Skill tool: /${name}\n`;
          }
        }
        prompt += '\nApply the methodologies from these skills throughout this task.\n';
      }
    }
  }

  // Feature 2: Images passed to AI prompt
  if (Array.isArray(task.images) && task.images.length > 0) {
    prompt += '\n## Attached Images\n';
    for (const url of task.images) {
      prompt += `${url}\n`;
    }
  }

  // Feature 3: Multi-agent prompt injection
  if (task.multiagent === 'yes') {
    prompt += '\n## Multi-Agent Mode\nUse subagents to parallelize this work. Dispatch separate agents for independent subtasks.\n';
  }

  if (task.followup_notes) {
    prompt += `\n## Rework Feedback\n${task.followup_notes}\n`;
    // Include task's own artifacts so the AI can revise them
    const { data: ownArtifacts } = await supabase
      .from('task_artifacts').select('*').eq('task_id', task.id).order('created_at');
    if (ownArtifacts && ownArtifacts.length > 0) {
      prompt += '\n## Previously Generated Files\n';
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
      prompt += 'Revise these files based on the feedback above.\n';
    }
  }

  if (previousOutputs.length > 0) {
    prompt += '\n## Previous Phase Outputs\n';
    for (const po of previousOutputs) {
      prompt += `### ${po.phase} (attempt ${po.attempt})\n${JSON.stringify(po.output, null, 2)}\n\n`;
    }
  }

  if (answer) {
    prompt += `\n## Human Answer to Your Question\n${answer}\n`;
  }

  // Inject artifacts from previous task in workstream
  if (
    (task.chaining === 'accept' || task.chaining === 'both') &&
    previousOutputs.length === 0
  ) {
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('workstream_id, position')
      .eq('id', task.id)
      .single();

    if (currentTask?.workstream_id) {
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
              prompt += `- ${a.filename} (${a.mime_type}): ${url}\n`;
            }
          }
          prompt += '\nThe artifacts from the previous task are provided above. Use them as context for your work.\n';
        }
      }
    }
  }

  // Phase-specific instructions
  const phaseInstructions: Record<string, string> = {
    plan: 'Read the codebase to understand the relevant files and architecture. Create a step-by-step implementation plan. List which files need to be created or modified and what changes are needed. Do NOT make any changes yet — only plan.',
    analyze: 'Analyze the codebase to understand the problem. Identify the root cause and location. Output a structured summary of your findings.',
    fix: 'Fix the issue based on the analysis. Make the minimal changes needed. Run tests if available.',
    implement: 'Implement the feature described above. Follow existing code patterns. Run tests if available.',
    verify: `Run the test suite and verify the changes work. Report any issues found.

IMPORTANT: You MUST end your response with a JSON verdict block:
\`\`\`json
{"passed": true}
\`\`\`
or if tests fail:
\`\`\`json
{"passed": false, "reason": "Brief description of what failed"}
\`\`\``,
    review: `Review the changes made. Check code quality, architecture alignment, and completeness.

IMPORTANT: You MUST end your response with a JSON verdict block:
\`\`\`json
{"passed": true}
\`\`\`
or if issues found:
\`\`\`json
{"passed": false, "reason": "Brief description of issues"}
\`\`\``,
    refactor: 'Refactor the code as described. Maintain all existing behavior. Run tests to verify nothing broke.',
    'write-tests': 'Write tests for the described functionality. Follow existing test patterns in the project.',
    answer: 'Answer the user\'s question based on the document search results provided above. Cite which documents you\'re referencing. If the results don\'t contain enough information to answer fully, say so clearly.',
  };

  // Feature 5: Custom prompt files from .codesync/prompts/
  let phaseText = phaseInstructions[phase] || 'Complete this phase of the task.';
  if (phaseConfig.prompt && phaseConfig.prompt.length > 0) {
    const customPromptPath = join(localPath, '.codesync', phaseConfig.prompt);
    if (existsSync(customPromptPath)) {
      try {
        phaseText = readFileSync(customPromptPath, 'utf-8');
      } catch { /* fall through to default */ }
    }
  }

  prompt += `\n## Current Phase: ${phase}\n${phaseText}\n`;

  // File output instruction for tasks that produce artifacts
  if (task.chaining === 'produce' || task.chaining === 'both') {
    prompt += '\n## File Output\nIf you produce any output files (documents, images, configs, etc.), save them to the `.artifacts/` directory in the project root. They will be automatically captured and made available for download.\n';
  }

  // Feature 4: Skill field injection — read actual skill file if available
  if (phaseConfig.skill) {
    const skillPaths = [
      join(localPath, '.claude', 'skills', phaseConfig.skill, 'SKILL.md'),
      join(localPath, '.claude', 'commands', phaseConfig.skill + '.md'),
    ];
    let skillContent: string | null = null;
    for (const sp of skillPaths) {
      if (existsSync(sp)) {
        try {
          skillContent = readFileSync(sp, 'utf-8').substring(0, 4000);
        } catch { /* ignore read failure */ }
        break;
      }
    }
    if (skillContent) {
      prompt += `\n## Skill: ${phaseConfig.skill}\n${skillContent}\n`;
    } else {
      prompt += `\n## Skill: ${phaseConfig.skill}\nApply the ${phaseConfig.skill} methodology for this phase.\n`;
    }
  }

  // Feature 6: Review criteria from ARCHITECTURE.md
  if (phase === 'review') {
    // Check config.json for review_criteria
    const configPath = join(localPath, '.codesync', 'config.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (config.review_criteria && Array.isArray(config.review_criteria.rules) && config.review_criteria.rules.length > 0) {
          prompt += '\n## Review Criteria\n';
          for (const rule of config.review_criteria.rules) {
            prompt += `- ${rule}\n`;
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Check for ARCHITECTURE.md
    let archContent: string | null = null;
    const archPaths = [
      join(localPath, 'ARCHITECTURE.md'),
      join(localPath, 'docs', 'ARCHITECTURE.md'),
    ];
    for (const archPath of archPaths) {
      if (existsSync(archPath)) {
        try {
          archContent = readFileSync(archPath, 'utf-8');
          break;
        } catch { /* ignore */ }
      }
    }
    if (archContent) {
      prompt += `\n## Architecture Reference\n${archContent.substring(0, 8000)}\n`;
    }
  }

  prompt += '\nWhen done, write a brief summary of what you did and any issues found.\n';
  prompt += 'If you need clarification from the human, clearly state your question and stop.\n';

  return prompt;
}

// --- Structured verdict parsing for verify/review phases ---

interface PhaseVerdict {
  passed: boolean;
  reason: string;
}

/** Extract a one-sentence summary from a phase's raw output. */
function extractPhaseSummary(rawOutput: string): string {
  const lines = rawOutput.split('\n').filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (/^\[/.test(t)) return false;
    if (t.startsWith('---')) return false;
    if (t.startsWith('RULES:') || t.startsWith('IMPORTANT:')) return false;
    return true;
  });
  const last = lines[lines.length - 1]?.trim() || '';
  return last.length > 120 ? last.substring(0, 117) + '...' : last;
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

// Active processes for cancellation
const activeProcesses = new Map<string, ChildProcess>();

export function cancelJob(jobId: string): Promise<void> {
  const proc = activeProcesses.get(jobId);
  if (!proc) return Promise.resolve();
  activeProcesses.delete(jobId);
  return new Promise((resolve) => {
    proc.kill('SIGTERM');
    const escalate = setTimeout(() => {
      try { if (!proc.killed) proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, 5000);
    proc.on('close', () => { clearTimeout(escalate); resolve(); });
    // Resolve after 6s regardless to avoid hanging forever
    setTimeout(resolve, 6000);
  });
}

export function cancelAllJobs() {
  for (const [jobId, proc] of activeProcesses) {
    proc.kill('SIGTERM');
    setTimeout(() => {
      try { if (!proc.killed) proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, 5000);
    activeProcesses.delete(jobId);
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
    if (!activeProcesses.has(job.id)) {
      const elapsed = Date.now() - new Date(job.started_at).getTime();
      const elapsedMin = Math.round(elapsed / 60000);

      const failMsg = `Job failed: worker was restarted while this job was running (after ${elapsedMin}m). Click "Run" on the task to retry.`;
      await supabase.from('jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        question: failMsg,
      }).eq('id', job.id);

      await supabase.from('tasks').update({
        status: 'paused',
      }).eq('id', job.task_id);

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

export async function runJob(ctx: JobContext): Promise<void> {
  const { jobId, task, taskType, localPath, onLog, onPhaseStart, onPhaseComplete, onPause, onReview, onDone, onFail, phasesAlreadyCompleted } = ctx;

  // Seed with already-completed phases from a previous run (for resume)
  const phasesCompleted: any[] = [...phasesAlreadyCompleted];

  // Build the set of phase names already done, so we can skip them
  const completedPhaseNames = new Set(phasesAlreadyCompleted.map((p: any) => p.phase));

  // On resume with a human answer, remove the paused phase from completed
  // so it re-executes with fresh retries instead of looping back to pause
  if (phasesAlreadyCompleted.length > 0 && task.answer) {
    const lastPhase = phasesAlreadyCompleted[phasesAlreadyCompleted.length - 1]?.phase;
    if (lastPhase) {
      completedPhaseNames.delete(lastPhase);
    }
  }

  // Run through phases
  const allPhases = [...taskType.phases, taskType.final];

  // Track cumulative attempts per phase so jump-back retries don't reset the counter
  const phaseAttemptOffsets: Record<string, number> = {};

  let i = 0;
  while (i < allPhases.length) {
    const phase = allPhases[i];

    // Skip phases that were already completed in a previous run
    if (completedPhaseNames.has(phase)) {
      onLog(`\n--- Skipping already-completed phase: ${phase} ---\n`);
      i++;
      continue;
    }

    const phaseConfig = taskType.phase_config[phase];
    if (!phaseConfig) {
      await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
      onFail(`No config for phase: ${phase}`);
      return;
    }

    const maxAttempts = phase === 'verify' ? taskType.verify_retries + 1 :
                        phase === taskType.final ? taskType.review_retries + 1 : 1;
    const attemptOffset = phaseAttemptOffsets[phase] || 0;

    for (let attempt = 1; attempt <= maxAttempts - attemptOffset; attempt++) {
      const displayAttempt = attemptOffset + attempt;
      onPhaseStart(phase, displayAttempt);

      // Update job in DB
      await supabase.from('jobs').update({
        current_phase: phase,
        attempt: displayAttempt,
      }).eq('id', jobId);

      const prompt = await buildPrompt(phase, task, phasesCompleted, localPath, phaseConfig, taskType, ctx.task.answer);

      // Spawn claude -p (prompt piped via stdin to avoid arg length limits)
      const args = ['-p', '--verbose', '--output-format', 'stream-json'];
      if (phaseConfig.tools.length > 0) {
        args.push('--allowedTools', phaseConfig.tools.join(','));
        // Explicitly block write tools for read-only phases
        const writeTools = ['Edit', 'Write', 'NotebookEdit'];
        const blocked = writeTools.filter(t => !phaseConfig.tools.includes(t));
        if (blocked.length > 0) {
          args.push('--disallowedTools', blocked.join(','));
        }
      }

      // Model selection per phase
      if (phaseConfig.model) {
        args.push('--model', phaseConfig.model);
      }

      // Feature 1: Effort flag
      if (task.effort) {
        args.push('--effort', task.effort);
      }

      onLog(`\n--- Phase: ${phase} (attempt ${displayAttempt}/${maxAttempts}) ---\n`);

      try {
        const output = await spawnClaude(jobId, args, localPath, onLog, prompt);

        const phaseOutput = {
          phase,
          attempt,
          output: output.substring(0, 10000), // Cap output size
          summary: extractPhaseSummary(output),
        };
        phasesCompleted.push(phaseOutput);
        await savePhases(jobId, phasesCompleted);
        onPhaseComplete(phase, phaseOutput);

        // Check if claude asked a question (simple heuristic: ends with ?)
        const lastLines = output.trim().split('\n').slice(-3).join('\n');
        if (lastLines.includes('?') && (lastLines.includes('Should I') || lastLines.includes('Could you') || lastLines.includes('Which') || lastLines.includes('clarif'))) {
          await supabase.from('jobs').update({
            status: 'paused',
            question: lastLines,
            phases_completed: phasesCompleted,
          }).eq('id', jobId);
          await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
          onPause(lastLines);
          return;
        }

        // Verify phase: check if tests passed
        if (phase === 'verify') {
          const verdict = extractVerdict(output);
          if (!verdict) console.warn(`[runner] Job ${jobId}: verify phase returned no structured verdict, using legacy heuristics`);
          const failed = verdict ? !verdict.passed : legacyVerifyCheck(output);
          const reason = verdict?.reason || 'verification failed (see output)';
          if (failed && displayAttempt < maxAttempts) {
            const jumpTarget = taskType.on_verify_fail;
            const jumpIndex = allPhases.indexOf(jumpTarget);
            if (jumpIndex >= 0 && jumpIndex < i) {
              onLog(`\nVerify failed: ${reason}. Jumping back to '${jumpTarget}'...\n`);
              completedPhaseNames.delete(jumpTarget);
              // Remove stale phase output so Claude doesn't see duplicate context
              for (let pi = phasesCompleted.length - 1; pi >= 0; pi--) {
                if (phasesCompleted[pi].phase === jumpTarget) { phasesCompleted.splice(pi, 1); break; }
              }
              phaseAttemptOffsets[phase] = displayAttempt;
              i = jumpIndex;
              break;
            } else {
              onLog(`\nVerify failed: ${reason}. Retrying...\n`);
              continue;
            }
          }
          if (failed && displayAttempt >= maxAttempts) {
            if (taskType.on_max_retries === 'pause') {
              const pauseMsg = `Tests still failing after ${maxAttempts} attempts: ${reason}`;
              await supabase.from('jobs').update({
                status: 'paused',
                question: pauseMsg,
                phases_completed: phasesCompleted,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onPause(pauseMsg);
              return;
            }
          }
        }

        // Review/final phase: check if review passed
        if (phase === taskType.final) {
          const verdict = extractVerdict(output);
          if (!verdict) console.warn(`[runner] Job ${jobId}: review phase returned no structured verdict, using legacy heuristics`);
          const failed = verdict ? !verdict.passed : legacyReviewCheck(output);
          const reason = verdict?.reason || 'review found issues (see output)';
          if (failed && displayAttempt < maxAttempts) {
            const jumpTarget = taskType.on_review_fail;
            const jumpIndex = allPhases.indexOf(jumpTarget);
            if (jumpIndex >= 0 && jumpIndex < i) {
              onLog(`\nReview failed: ${reason}. Jumping back to '${jumpTarget}'...\n`);
              completedPhaseNames.delete(jumpTarget);
              // Remove stale phase output so Claude doesn't see duplicate context
              for (let pi = phasesCompleted.length - 1; pi >= 0; pi--) {
                if (phasesCompleted[pi].phase === jumpTarget) { phasesCompleted.splice(pi, 1); break; }
              }
              phaseAttemptOffsets[phase] = displayAttempt;
              i = jumpIndex;
              break;
            } else {
              onLog(`\nReview failed: ${reason}. Retrying...\n`);
              continue;
            }
          }
          if (failed && displayAttempt >= maxAttempts) {
            if (taskType.on_max_retries === 'pause') {
              const pauseMsg = `Review still failing after ${maxAttempts} attempts: ${reason}`;
              await supabase.from('jobs').update({
                status: 'paused',
                question: pauseMsg,
                phases_completed: phasesCompleted,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onPause(pauseMsg);
              return;
            }
          }
        }

        // Move to next phase
        i++;
        break;

      } catch (err: any) {
        // If the job was canceled, the cancellation loop handles cleanup — just bail out.
        if (err.message === 'Job canceled') return;

        onLog(`\nError in phase ${phase}: ${err.message}\n`);
        if (attempt >= maxAttempts) {
          let failMessage = `Phase '${phase}' failed: ${err.message}`;
          let revertSucceeded = false;
          try {
            const { revertToCheckpoint } = await import('./checkpoint.js');
            revertToCheckpoint(localPath, jobId);
            onLog('[checkpoint] Auto-reverted changes after failure\n');
            failMessage += '. Changes have been automatically reverted.';
            revertSucceeded = true;
          } catch (revertErr: any) {
            onLog(`[checkpoint] Could not revert: ${revertErr.message}\n`);
            failMessage += '. WARNING: Changes were NOT reverted — manual cleanup may be needed.';
          }
          await supabase.from('jobs').update({
            status: 'failed',
            phases_completed: phasesCompleted,
            completed_at: new Date().toISOString(),
            question: failMessage,
            checkpoint_status: revertSucceeded ? 'reverted' : 'active',
          }).eq('id', jobId);
          // Runner is sole authority: always update task status on failure
          await supabase.from('tasks').update({ status: 'paused' }).eq('id', ctx.taskId);
          onFail(failMessage);
          return;
        }
      }
    }
  }

  // All phases complete -- move to review

  // Scan .artifacts/ directory for produced files
  if (ctx.task.chaining === 'produce' || ctx.task.chaining === 'both') {
    await scanAndUploadArtifacts(localPath, ctx.taskId, jobId, phasesCompleted[phasesCompleted.length - 1]?.phase || 'unknown', onLog);
  }

  const reviewOutput = phasesCompleted[phasesCompleted.length - 1];

  let { filesChanged, linesAdded, linesRemoved, changedFiles } = { filesChanged: 0, linesAdded: 0, linesRemoved: 0, changedFiles: [] as string[] };
  try {
    ({ filesChanged, linesAdded, linesRemoved, changedFiles } = stagedDiffStat(localPath));
  } catch { /* ignore */ }

  // Generate a clean summary by asking Claude to summarize the phase outputs
  let finalSummary = 'Completed';
  try {
    const phaseLog = phasesCompleted.map((p: any) => {
      const raw = (p.output || '').split('\n').filter((l: string) => {
        const t = l.trim();
        return t && !/^\[/.test(t);
      }).join('\n').trim();
      return `## ${p.phase} (attempt ${p.attempt || 1})\n${raw}`;
    }).join('\n\n');

    const diffInfo = changedFiles.length > 0
      ? `Files changed: ${changedFiles.join(', ')} (+${linesAdded} -${linesRemoved})`
      : `${filesChanged} files changed (+${linesAdded} -${linesRemoved})`;

    const summaryPrompt = `You are summarizing a completed code task for a project dashboard.

Task: ${ctx.task.title}
${diffInfo}

Phase outputs:
${phaseLog.substring(0, 3000)}

Write a concise summary (2-4 sentences) of what was done and why. Focus on the actual change, not the process. No markdown formatting, no bullet points. Plain text only.`;

    finalSummary = await generateSummary(summaryPrompt);
  } catch (err: any) {
    console.error('[runner] Summary generation failed, using fallback:', err.message);
  }

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

  await supabase.from('jobs').update({
    status: 'review',
    phases_completed: phasesCompleted,
    review_result: reviewResult,
  }).eq('id', jobId);
  await supabase.from('tasks').update({ status: 'review' }).eq('id', ctx.taskId);
  await onReview(reviewResult);
  await onDone();
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

/** Quick claude call for generating summaries. No tools, no streaming, just text in/out. */
function generateSummary(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text', '--max-turns', '1', '--model', 'sonnet'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: claudeEnv,
      timeout: 30000,
    });

    let stdout = '';
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 || code === null) resolve(stdout.trim() || 'Completed');
      else reject(new Error(`summary claude exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

function spawnClaude(jobId: string, args: string[], cwd: string, onLog: (text: string) => void, prompt?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: claudeEnv,
    });

    activeProcesses.set(jobId, proc);
    let fullOutput = '';
    let lineBuffer = '';

    // Pipe prompt via stdin to avoid arg length limits
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
      const wasCanceled = !activeProcesses.has(jobId);
      activeProcesses.delete(jobId);
      if (wasCanceled) {
        reject(new Error('Job canceled'));
        return;
      }
      // If claude streamed a result event but exited non-zero, treat as success.
      // The CLI sometimes exits 1 after completing successfully (e.g. max turns reached).
      const hasResult = fullOutput.includes('[done] Phase complete');
      if (code === 0 || hasResult) {
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
      activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

export { loadTaskTypeConfig };
