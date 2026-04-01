import { spawn, ChildProcess, execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supabase } from './supabase.js';
import { discoverSkills } from './routes/data.js';

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
  onReview: (result: any) => void;
  onDone: () => void;
  onFail: (error: string) => void;
}

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

function buildPrompt(phase: string, task: any, previousOutputs: any[], localPath: string, phaseConfig: PhaseConfig, taskType: TaskTypeConfig, answer?: string): string {
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
    prompt += `\n## Followup Notes (from previous rejection)\n${task.followup_notes}\n`;
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

  // Phase-specific instructions
  const phaseInstructions: Record<string, string> = {
    plan: 'Read the codebase to understand the relevant files and architecture. Create a step-by-step implementation plan. List which files need to be created or modified and what changes are needed. Do NOT make any changes yet — only plan.',
    analyze: 'Analyze the codebase to understand the problem. Identify the root cause and location. Output a structured summary of your findings.',
    fix: 'Fix the issue based on the analysis. Make the minimal changes needed. Run tests if available.',
    implement: 'Implement the feature described above. Follow existing code patterns. Run tests if available.',
    verify: 'Run the test suite and verify the changes work. Report pass/fail and any remaining issues.',
    review: 'Review the changes made. Check code quality, architecture alignment, and completeness. Report any issues.',
    refactor: 'Refactor the code as described. Maintain all existing behavior. Run tests to verify nothing broke.',
    'write-tests': 'Write tests for the described functionality. Follow existing test patterns in the project.',
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

// Active processes for cancellation
const activeProcesses = new Map<string, ChildProcess>();

export function cancelJob(jobId: string) {
  const proc = activeProcesses.get(jobId);
  if (proc) {
    proc.kill('SIGTERM');
    activeProcesses.delete(jobId);
  }
}

export function cancelAllJobs() {
  for (const [jobId, proc] of activeProcesses) {
    proc.kill('SIGTERM');
    activeProcesses.delete(jobId);
  }
}

export function isJobActive(jobId: string): boolean {
  return activeProcesses.has(jobId);
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

      await supabase.from('jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        question: `Job failed: server was restarted while this job was running (after ${elapsedMin}m). The claude process was lost. Changes may need manual cleanup. Click "Run" on the task to retry.`,
      }).eq('id', job.id);

      await supabase.from('tasks').update({
        status: 'backlog',
      }).eq('id', job.task_id);

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

  // Run through phases
  const allPhases = [...taskType.phases, taskType.final];

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
      onFail(`No config for phase: ${phase}`);
      return;
    }

    const maxAttempts = phase === 'verify' ? taskType.verify_retries + 1 :
                        phase === taskType.final ? taskType.review_retries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onPhaseStart(phase, attempt);

      // Update job in DB
      await supabase.from('jobs').update({
        current_phase: phase,
        attempt,
      }).eq('id', jobId);

      const prompt = buildPrompt(phase, task, phasesCompleted, localPath, phaseConfig, taskType, ctx.task.answer);

      // Spawn claude -p (prompt piped via stdin to avoid arg length limits)
      const args = ['-p', '--verbose', '--max-turns', '20', '--output-format', 'stream-json'];
      if (phaseConfig.tools.length > 0) {
        args.push('--allowedTools', phaseConfig.tools.join(','));
      }

      // Model selection per phase
      if (phaseConfig.model) {
        args.push('--model', phaseConfig.model);
      }

      // Feature 1: Effort flag
      if (task.effort) {
        args.push('--effort', task.effort);
      }

      onLog(`\n--- Phase: ${phase} (attempt ${attempt}/${maxAttempts}) ---\n`);

      try {
        const output = await spawnClaude(jobId, args, localPath, onLog, prompt);

        const phaseOutput = {
          phase,
          attempt,
          output: output.substring(0, 10000), // Cap output size
        };
        phasesCompleted.push(phaseOutput);
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

        // Verify phase: check if output indicates failure
        if (phase === 'verify') {
          const lower = output.toLowerCase();
          const hasFail = /\bfail\b|tests?\s+fail/.test(lower);
          const hasError = lower.includes('error') || lower.includes('not passing');
          const excluded = lower.includes('no failures') || lower.includes('0 failed') || lower.includes('fixed');
          const failed = (hasFail || hasError) && !excluded;
          if (failed && attempt < maxAttempts) {
            // Jump back to the on_verify_fail phase instead of re-running verify
            const jumpTarget = taskType.on_verify_fail;
            const jumpIndex = allPhases.indexOf(jumpTarget);
            if (jumpIndex >= 0 && jumpIndex < i) {
              onLog(`\nVerify failed, jumping back to '${jumpTarget}' phase...\n`);
              // Remove the jump target from completed so it re-runs
              completedPhaseNames.delete(jumpTarget);
              i = jumpIndex;
              // Break out of the attempt loop; the outer while-loop will land on jumpTarget
              break;
            } else {
              onLog(`\nVerify failed, retrying...\n`);
              continue; // Retry verify if jump target not found
            }
          }
          if (failed && attempt >= maxAttempts) {
            if (taskType.on_max_retries === 'pause') {
              await supabase.from('jobs').update({
                status: 'paused',
                question: `Tests still failing after ${maxAttempts} attempts. Last output:\n${lastLines}`,
                phases_completed: phasesCompleted,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onPause(`Tests still failing after ${maxAttempts} attempts.`);
              return;
            }
          }
        }

        // Review/final phase: check if output indicates failure
        if (phase === taskType.final) {
          const lower = output.toLowerCase();
          const hasIssues = /issues?\s+found/.test(lower);
          const hasFail = lower.includes('fail') || lower.includes('problem') || lower.includes('reject');
          const excluded = lower.includes('no issues found') || lower.includes('no issues') || lower.includes('0 issues');
          const failed = (hasIssues || hasFail) && !excluded;
          if (failed && attempt < maxAttempts) {
            // Jump back to the on_review_fail phase instead of re-running review
            const jumpTarget = taskType.on_review_fail;
            const jumpIndex = allPhases.indexOf(jumpTarget);
            if (jumpIndex >= 0 && jumpIndex < i) {
              onLog(`\nReview failed, jumping back to '${jumpTarget}' phase...\n`);
              // Remove the jump target from completed so it re-runs
              completedPhaseNames.delete(jumpTarget);
              i = jumpIndex;
              // Break out of the attempt loop; the outer while-loop will land on jumpTarget
              break;
            } else {
              onLog(`\nReview failed, retrying...\n`);
              continue; // Retry review if jump target not found
            }
          }
          if (failed && attempt >= maxAttempts) {
            if (taskType.on_max_retries === 'pause') {
              await supabase.from('jobs').update({
                status: 'paused',
                question: `Review still failing after ${maxAttempts} attempts. Last output:\n${lastLines}`,
                phases_completed: phasesCompleted,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onPause(`Review still failing after ${maxAttempts} attempts.`);
              return;
            }
          }
        }

        // Move to next phase
        i++;
        break;

      } catch (err: any) {
        onLog(`\nError in phase ${phase}: ${err.message}\n`);
        if (attempt >= maxAttempts) {
          let failMessage = `Job failed: ${err.message}`;
          try {
            const { revertToCheckpoint } = await import('./checkpoint.js');
            revertToCheckpoint(localPath, jobId);
            onLog('[checkpoint] Auto-reverted changes after failure\n');
            failMessage += '. Changes have been automatically reverted.';
          } catch { /* ignore revert failure */ }
          await supabase.from('jobs').update({
            status: 'failed',
            phases_completed: phasesCompleted,
            completed_at: new Date().toISOString(),
            question: failMessage,
          }).eq('id', jobId);
          onFail(err.message);
          return;
        }
      }
    }
  }

  // All phases complete -- move to review
  const reviewOutput = phasesCompleted[phasesCompleted.length - 1];

  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  try {
    const diffStat = execFileSync('git', ['diff', '--stat', '--cached'], {
      cwd: localPath, encoding: 'utf-8', timeout: 5000
    }).trim();
    // If no staged changes, try unstaged
    const stat = diffStat || execFileSync('git', ['diff', '--stat'], {
      cwd: localPath, encoding: 'utf-8', timeout: 5000
    }).trim();

    // Parse "3 files changed, 28 insertions(+), 12 deletions(-)"
    const match = stat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (match) {
      filesChanged = parseInt(match[1]) || 0;
      linesAdded = parseInt(match[2]) || 0;
      linesRemoved = parseInt(match[3]) || 0;
    }
  } catch { /* ignore git errors */ }

  const reviewResult = {
    filesChanged,
    testsPassed: true,
    linesAdded,
    linesRemoved,
    summary: reviewOutput?.output?.substring(0, 500) || 'Completed',
  };

  await supabase.from('jobs').update({
    status: 'review',
    phases_completed: phasesCompleted,
    review_result: reviewResult,
  }).eq('id', jobId);
  await supabase.from('tasks').update({ status: 'review' }).eq('id', ctx.taskId);
  onReview(reviewResult);
  onDone();
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

function spawnClaude(jobId: string, args: string[], cwd: string, onLog: (text: string) => void, prompt?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' },
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

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
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
      activeProcesses.delete(jobId);
      if (code === 0 || code === null) {
        resolve(fullOutput);
      } else {
        reject(new Error(`claude exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

export { loadTaskTypeConfig };
