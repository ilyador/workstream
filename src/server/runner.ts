import { spawn, ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supabase } from './supabase.js';

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
    phases: ['analyze', 'fix', 'verify'],
    on_verify_fail: 'fix',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'fix',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      analyze: { skill: null, tools: ['Read', 'Grep', 'Bash'], prompt: '', model: 'opus' },
      fix: { skill: null, tools: ['Read', 'Edit', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'feature': {
    phases: ['implement', 'verify'],
    on_verify_fail: 'implement',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'implement',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      implement: { skill: null, tools: ['Read', 'Edit', 'Write', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'refactor': {
    phases: ['analyze', 'refactor', 'verify'],
    on_verify_fail: 'refactor',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'refactor',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      analyze: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'opus' },
      refactor: { skill: null, tools: ['Read', 'Edit', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'test': {
    phases: ['write-tests', 'verify'],
    on_verify_fail: 'write-tests',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'write-tests',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
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

  // Feature 4: Skill field injection
  if (phaseConfig.skill) {
    prompt += `\n## Skill: ${phaseConfig.skill}\nApply the ${phaseConfig.skill} methodology for this phase.\n`;
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

      // Spawn claude -p
      const args = ['-p', prompt, '--max-turns', '20'];
      if (phaseConfig.tools.length > 0) {
        args.push('--allowedTools', phaseConfig.tools.join(','));
      }

      // Feature 1: Effort flag
      if (task.effort) {
        args.push('--effort', task.effort);
      }

      onLog(`\n--- Phase: ${phase} (attempt ${attempt}/${maxAttempts}) ---\n`);

      try {
        const output = await spawnClaude(jobId, args, localPath, onLog);

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
          const failed = lower.includes('fail') || lower.includes('error') || lower.includes('not passing');
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

        // Move to next phase
        i++;
        break;

      } catch (err: any) {
        onLog(`\nError in phase ${phase}: ${err.message}\n`);
        if (attempt >= maxAttempts) {
          await supabase.from('jobs').update({
            status: 'failed',
            phases_completed: phasesCompleted,
            completed_at: new Date().toISOString(),
          }).eq('id', jobId);
          onFail(err.message);
          return;
        }
      }
    }
  }

  // All phases complete -- move to review
  const reviewOutput = phasesCompleted[phasesCompleted.length - 1];
  const reviewResult = {
    filesChanged: 0, // TODO: parse from git diff
    testsPassed: true,
    linesAdded: 0,
    linesRemoved: 0,
    summary: reviewOutput?.output?.substring(0, 500) || 'Completed',
  };

  await supabase.from('jobs').update({
    status: 'review',
    phases_completed: phasesCompleted,
    review_result: reviewResult,
  }).eq('id', jobId);
  await supabase.from('tasks').update({ status: 'review' }).eq('id', ctx.taskId);
  onReview(reviewResult);
}

function spawnClaude(jobId: string, args: string[], cwd: string, onLog: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' },
    });

    activeProcesses.set(jobId, proc);
    let stdout = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      onLog(text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      onLog(data.toString());
    });

    proc.on('close', (code) => {
      activeProcesses.delete(jobId);
      if (code === 0 || code === null) {
        resolve(stdout);
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
