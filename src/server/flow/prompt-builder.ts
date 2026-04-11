import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supabase } from '../supabase.js';
import { stagedDiff } from '../git-utils.js';
import { discoverSkills } from '../routes/data.js';
import type { FlowConfig, FlowStepConfig } from '../flow-config.js';

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
