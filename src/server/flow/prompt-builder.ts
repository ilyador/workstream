import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supabase } from '../supabase.js';
import { stagedDiff } from '../git-utils.js';
import { discoverSkills } from '../routes/data.js';
import type { FlowConfig, FlowStepConfig } from '../flow-config.js';

function readFileOrEmpty(path: string, maxChars: number): string {
  try {
    return readFileSync(path, 'utf-8').substring(0, maxChars);
  } catch {
    return '';
  }
}

function formatRagResults(results: any[]): string {
  let out = '## Document Search Results\nThe following passages were found relevant to your question:\n\n';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    out += `[${i + 1}] From "${r.file_name}" (${(r.similarity * 100).toFixed(1)}% match):\n${r.content}\n\n`;
  }
  return out;
}

const SUMMARY_INSTRUCTIONS =
  'If you need clarification from the human, clearly state your question and stop.\n' +
  '\nAt the very end of your response, write a one-line summary of what you did in this step using this exact format:\n' +
  '[summary] Your short summary here\n';

/** Build prompt for a single flow step, including only the requested context sources. */
export async function buildStepPrompt(
  step: FlowStepConfig,
  flow: FlowConfig,
  task: any,
  previousOutputs: any[],
  localPath: string,
  answer?: string,
): Promise<string> {
  const parts: string[] = ["You are working on a task in this project's codebase.\n"];

  if (flow.agents_md) {
    parts.push(`## Agent Instructions\n${flow.agents_md.substring(0, 8000)}\n`);
  }

  for (const source of step.context_sources) {
    const block = await buildContextSource(source, task, previousOutputs, localPath);
    if (block) parts.push(block);
  }

  const projectDataBlock = buildProjectDataBlock(step, task);
  if (projectDataBlock) parts.push(projectDataBlock);

  if (task.multiagent === 'yes') {
    parts.push('## Multi-Agent Mode\nUse subagents to parallelize this work. Dispatch separate agents for independent subtasks.\n');
  }

  if ((task.chaining === 'accept' || task.chaining === 'both') && previousOutputs.length === 0) {
    parts.push('## Artifact Context\nThe artifacts from the previous task are provided above. Use them as context for your work.\n');
  }

  parts.push(`## Current Step: ${step.name}\n${step.instructions}\n`);

  if (task.chaining === 'produce' || task.chaining === 'both') {
    parts.push('## File Output\nIf you produce any output files (documents, images, configs, etc.), save them to the `.artifacts/` directory in the project root. They will be automatically captured and made available for download.\n');
  }

  if (answer) {
    parts.push(`## Human Answer to Your Question\n${answer}\n`);
  }

  parts.push(SUMMARY_INSTRUCTIONS);
  return parts.join('\n');
}

async function buildContextSource(
  source: string,
  task: any,
  previousOutputs: any[],
  localPath: string,
): Promise<string | null> {
  switch (source) {
    case 'agents':             return buildAgentsContext(localPath);
    case 'task_description':   return buildTaskDescriptionContext(task);
    case 'task_images':        return buildTaskImagesContext(task);
    case 'skills':             return buildSkillsContext(task, localPath);
    case 'followup_notes':     return buildFollowupNotesContext(task);
    case 'architecture_md':    return buildArchitectureContext(localPath);
    case 'review_criteria':    return buildReviewCriteriaContext(localPath);
    case 'git_diff':           return buildGitDiffContext(localPath);
    case 'previous_step':      return buildPreviousStepContext(previousOutputs);
    case 'gate_feedback':      return buildGateFeedbackContext(task);
    case 'all_previous_steps': return buildAllPreviousStepsContext(previousOutputs);
    case 'previous_artifacts': return buildPreviousArtifactsContext(task);
    default: return null;
  }
}

function buildAgentsContext(localPath: string): string | null {
  const agentPaths = [join(localPath, 'AGENTS.md'), join(localPath, 'CLAUDE.md')];
  for (const agentPath of agentPaths) {
    if (!existsSync(agentPath)) continue;
    const content = readFileOrEmpty(agentPath, 8000);
    return `## Repository Instructions\n${content}\n`;
  }
  return null;
}

function buildTaskDescriptionContext(task: any): string {
  return `## Task\nTitle: ${task.title}\nDescription: ${task.description || 'No description provided.'}\n`;
}

function buildTaskImagesContext(task: any): string | null {
  if (Array.isArray(task.images) && task.images.length > 0) {
    let out = '## Attached Images\n';
    for (const url of task.images) out += `${url}\n`;
    return out;
  }
  return null;
}

function buildSkillsContext(task: any, localPath: string): string | null {
  if (task.description) {
    const skillRefs = [...task.description.matchAll(/(?:^|[\s\n])\/([a-zA-Z0-9_][\w:-]*)/g)].map((m: RegExpMatchArray) => m[1]);
    if (skillRefs.length > 0) {
      const available = discoverSkills(localPath);
      const skillMap = new Map(available.map((s: any) => [s.name, s]));
      const verified = skillRefs.filter((name: string) => skillMap.has(name));
      if (verified.length > 0) {
        let out = '## Skills to Apply\n';
        for (const name of verified) {
          const skill = skillMap.get(name)!;
          try {
            let content = readFileSync(skill.filePath, 'utf-8');
            content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
            if (content.length > 8000) content = content.substring(0, 8000) + '\n...(truncated)';
            out += `\n### Skill: /${name}\n${content}\n`;
          } catch {
            out += `\n### Skill: /${name}\nInvoke this skill using the Skill tool: /${name}\n`;
          }
        }
        out += '\n';
        return out;
      }
    }
  }
  return null;
}

async function buildFollowupNotesContext(task: any): Promise<string | null> {
  if (task.followup_notes) {
    let out = `## Rework Feedback\n${task.followup_notes}\n\n`;
    // Include task's own artifacts so the AI can revise them
    const { data: ownArtifacts } = await supabase
      .from('task_artifacts').select('*').eq('task_id', task.id).order('created_at');
    if (ownArtifacts && ownArtifacts.length > 0) {
      out += '## Previously Generated Files\n';
      for (const a of ownArtifacts) {
        if (a.mime_type.startsWith('text/') || a.mime_type === 'application/json') {
          const { data: fileData } = await supabase.storage.from('task-artifacts').download(a.storage_path);
          if (fileData) {
            const content = await fileData.text();
            out += `### ${a.filename}\n\`\`\`\n${content}\n\`\`\`\n\n`;
          }
        } else {
          out += `- ${a.filename} (${a.mime_type})\n`;
        }
      }
      out += 'Revise these files based on the feedback above.\n';
    }
    return out;
  }
  return null;
}

function buildArchitectureContext(localPath: string): string | null {
  const archPaths = [join(localPath, 'ARCHITECTURE.md'), join(localPath, 'docs', 'ARCHITECTURE.md')];
  for (const archPath of archPaths) {
    if (existsSync(archPath)) {
      const content = readFileOrEmpty(archPath, 8000);
      if (content) return `## Architecture Reference\n${content}\n`;
      break;
    }
  }
  return null;
}

function buildReviewCriteriaContext(localPath: string): string | null {
  const configPath = join(localPath, '.codesync', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.review_criteria && Array.isArray(config.review_criteria.rules) && config.review_criteria.rules.length > 0) {
        let out = '## Review Criteria\n';
        for (const rule of config.review_criteria.rules) out += `- ${rule}\n`;
        return out;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function buildGitDiffContext(localPath: string): string | null {
  try {
    // Stage temporarily so untracked (new) files appear in the diff
    const diff = stagedDiff(localPath);
    if (diff) {
      return `## Git Diff (changes made)\n\`\`\`diff\n${diff.substring(0, 12000)}\n\`\`\`\n`;
    }
  } catch { /* ignore */ }
  return null;
}

function buildPreviousStepContext(previousOutputs: any[]): string | null {
  if (previousOutputs.length > 0) {
    const last = previousOutputs[previousOutputs.length - 1];
    return `## Previous Step: ${last.phase}\n${typeof last.output === 'string' ? last.output : JSON.stringify(last.output, null, 2)}\n`;
  }
  return null;
}

function buildGateFeedbackContext(task: any): string | null {
  if (task._gateFeedback) {
    return `## Previous Step Feedback (retry reason)\n${task._gateFeedback}\n`;
  }
  return null;
}

function buildAllPreviousStepsContext(previousOutputs: any[]): string | null {
  if (previousOutputs.length > 0) {
    let out = '## Previous Phase Outputs\n';
    for (const po of previousOutputs) {
      out += `### ${po.phase} (attempt ${po.attempt})\n${typeof po.output === 'string' ? po.output : JSON.stringify(po.output, null, 2)}\n\n`;
    }
    return out;
  }
  return null;
}

async function buildPreviousArtifactsContext(task: any): Promise<string | null> {
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
        let out = '\n## Artifacts from previous task\n';
        out += `Previous task: "${prevTask.title}"\n\n`;
        for (const a of artifacts) {
          const { data: urlData } = supabase.storage.from('task-artifacts').getPublicUrl(a.storage_path);
          const url = urlData.publicUrl;

          // For text files, inline the content
          if (a.mime_type.startsWith('text/') || a.mime_type === 'application/json') {
            try {
              const { data: fileData } = await supabase.storage.from('task-artifacts').download(a.storage_path);
              if (fileData) {
                const text = await fileData.text();
                out += `### ${a.filename}\n\`\`\`\n${text.substring(0, 5000)}\n\`\`\`\n\n`;
              }
            } catch {
              out += `- ${a.filename} (${a.mime_type}): ${url}\n`;
            }
          } else {
            // For images and binary, provide URL
            out += `- ${a.filename} (${a.mime_type}): ${url}\n`;
          }
        }
        out += '\n';
        return out;
      }
    }
  }
  return null;
}

function buildProjectDataBlock(step: FlowStepConfig, task: any): string | null {
  if (step.use_project_data && task.allow_project_data) {
    let out = '';
    if (task._projectDataResults?.length > 0) out += formatRagResults(task._projectDataResults);
    if (step.tools.includes('Bash')) {
      out += `## Project Data Search Tool\nYou can search indexed project documents using the Bash tool:\n\`\`\`\nnpx tsx src/server/rag-cli.ts ${task.project_id} "your search query"\n\`\`\`\nUse targeted queries to find architecture, specs, docs, lore, or any other indexed project knowledge.\n`;
    } else {
      out += '## Project Data Search Tool\nThis step can use any Project Data results already included above, but it cannot run additional Project Data searches because the Bash tool is disabled for this step.\n';
    }
    return out;
  }
  return null;
}
