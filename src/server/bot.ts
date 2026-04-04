import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { execFile } from 'child_process';
import { supabase } from './supabase.js';
import { claudeEnv } from './runner.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('[bot] TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const bot = new Bot(token);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getLinkedProject(chatId: number) {
  const { data } = await supabase
    .from('bot_chats')
    .select('project_id')
    .eq('chat_id', chatId)
    .single();
  return data?.project_id as string | undefined;
}

async function showProjectPicker(chatId: number) {
  const { data: projects } = await supabase.from('projects').select('id, name').order('name');
  if (!projects || projects.length === 0) {
    await bot.api.sendMessage(chatId, 'No projects found in WorkStream.');
    return;
  }
  const kb = new InlineKeyboard();
  for (const p of projects) {
    kb.text(p.name, `pick:${p.id}`).row();
  }
  await bot.api.sendMessage(chatId, 'Pick a project:', { reply_markup: kb });
}

async function buildProjectSummary(projectId: string): Promise<string> {
  const [{ data: project }, { data: tasks }, { data: jobs }, { data: workstreams }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('position'),
    supabase.from('jobs').select('*').eq('project_id', projectId).order('started_at', { ascending: false }).limit(10),
    supabase.from('workstreams').select('*').eq('project_id', projectId).order('position'),
  ]);

  const backlog = tasks?.filter(t => ['backlog', 'todo'].includes(t.status)) || [];
  const done = tasks?.filter(t => t.status === 'done') || [];
  const active = tasks?.filter(t => ['in_progress', 'paused', 'review'].includes(t.status)) || [];

  let md = `# Project: ${project?.name || 'Unknown'}\n\n`;

  if (workstreams && workstreams.length > 0) {
    md += `## Workstreams\n`;
    for (const ws of workstreams) md += `- ${ws.name} (${ws.id})\n`;
    md += '\n';
  }

  if (active.length > 0) {
    md += `## Active\n`;
    for (const t of active) md += `- [${t.status}] ${t.title} (${t.type}, id: ${t.id})\n`;
    md += '\n';
  }

  if (jobs && jobs.length > 0) {
    md += `## Recent Jobs\n`;
    for (const j of jobs.slice(0, 5)) {
      md += `- [${j.status}] ${j.current_phase || ''} ${j.status === 'paused' ? `-- ${j.question}` : ''}\n`;
    }
    md += '\n';
  }

  md += `## Backlog (${backlog.length} tasks)\n`;
  for (const t of backlog.slice(0, 15)) {
    md += `- ${t.title} (${t.type}, id: ${t.id})\n`;
  }

  md += `\n## Done: ${done.length} tasks completed\n`;
  return md;
}

function askOpencode(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile('opencode', ['-p', '--output-format', 'text', '--max-turns', '3'], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      env: claudeEnv,
    }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
    proc.stdin?.write(`${systemPrompt}\n\nUser message: ${userMessage}`);
    proc.stdin?.end();
  });
}

function buildSystemPrompt(projectName: string, summary: string): string {
  return `You are the WorkStream project assistant for "${projectName}". Here is the current project state:

${summary}

You can take actions by including ACTION lines in your response. Format:
ACTION: action_name {"param": "value"}

Available actions:
- create_task: Create a new task. Params: title (required), type (bug-fix|feature|refactor|test|chore, default: feature), description (optional), workstream_id (optional)
- update_task: Update task status. Params: task_id (required), status (backlog|done|canceled), title (optional)
- add_comment: Add a comment to a task. Params: task_id (required), message (required)

Rules:
- Keep responses concise and helpful. This is a Telegram chat, not a document.
- When users ask to create or update tasks, include the appropriate ACTION line.
- When listing tasks, use the data from the project state above.
- You can include multiple ACTION lines if needed.
- Do NOT wrap your response in markdown code fences.`;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

interface Action {
  name: string;
  params: Record<string, any>;
}

function parseActions(response: string): { text: string; actions: Action[] } {
  const lines = response.split('\n');
  const actions: Action[] = [];
  const textLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^ACTION:\s+(\w+)\s+(.+)$/);
    if (match) {
      try {
        actions.push({ name: match[1], params: JSON.parse(match[2]) });
      } catch {
        textLines.push(line);
      }
    } else {
      textLines.push(line);
    }
  }

  return { text: textLines.join('\n').trim(), actions };
}

async function executeAction(action: Action, projectId: string): Promise<string> {
  switch (action.name) {
    case 'create_task': {
      const { title, type = 'feature', description, workstream_id } = action.params;
      const { data: maxTask } = await supabase
        .from('tasks')
        .select('position')
        .eq('project_id', projectId)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      const { data, error } = await supabase.from('tasks').insert({
        project_id: projectId,
        title,
        type,
        description: description || '',
        workstream_id: workstream_id || null,
        position: (maxTask?.position || 0) + 1,
      }).select().single();

      if (error) return `Failed to create task: ${error.message}`;
      return `Created task "${data.title}" (${data.id})`;
    }

    case 'update_task': {
      const { task_id, ...updates } = action.params;
      const clean = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
      if (clean.status === 'done') (clean as any).completed_at = new Date().toISOString();
      const { error } = await supabase.from('tasks').update(clean).eq('id', task_id);
      if (error) return `Failed to update task: ${error.message}`;
      return `Updated task ${task_id}`;
    }

    case 'add_comment': {
      const { task_id, message } = action.params;
      const { data: taskRow } = await supabase.from('tasks').select('project_id').eq('id', task_id).single();
      const { data: botProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('name', 'WorkStream Bot')
        .limit(1)
        .single();
      let userId = botProfile?.id;
      if (!userId && taskRow?.project_id) {
        const { data: proj } = await supabase.from('projects').select('created_by').eq('id', taskRow.project_id).single();
        userId = proj?.created_by;
      }
      if (!userId) return 'No user found for comments';
      const { error } = await supabase.from('comments').insert({ task_id, user_id: userId, body: message });
      if (error) return `Failed to add comment: ${error.message}`;
      return `Comment added to ${task_id}`;
    }

    default:
      return `Unknown action: ${action.name}`;
  }
}

// ---------------------------------------------------------------------------
// Bot handlers
// ---------------------------------------------------------------------------

bot.command('start', async (ctx) => {
  await showProjectPicker(ctx.chat.id);
});

bot.command('switch', async (ctx) => {
  await showProjectPicker(ctx.chat.id);
});

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith('pick:')) return;
  const projectId = data.slice(5);

  const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single();

  await supabase.from('bot_chats').upsert(
    { chat_id: ctx.chat!.id, project_id: projectId },
    { onConflict: 'chat_id' },
  );

  await ctx.answerCallbackQuery({ text: `Linked to ${project?.name}` });
  await ctx.editMessageText(`Linked to *${project?.name}*. Send me a message to interact with the project.`, { parse_mode: 'Markdown' });
});

bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  let userMsg = ctx.message.text;

  // Ignore commands handled above
  if (userMsg.startsWith('/')) return;

  // In groups, only respond if the bot is mentioned or replied to
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  if (isGroup) {
    const botInfo = await bot.api.getMe();
    const botUsername = botInfo.username;
    const mentioned = botUsername && userMsg.includes(`@${botUsername}`);
    const repliedToBot = ctx.message.reply_to_message?.from?.id === botInfo.id;
    if (!mentioned && !repliedToBot) return;
    // Strip the @mention from the message
    if (botUsername) userMsg = userMsg.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
    if (!userMsg) return;
  }

  const projectId = await getLinkedProject(chatId);
  if (!projectId) {
    await ctx.reply('No project linked to this chat. Use /start to pick one.');
    return;
  }

  const thinking = await ctx.reply('Thinking...');

  try {
    const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single();
    const summary = await buildProjectSummary(projectId);
    const systemPrompt = buildSystemPrompt(project?.name || 'Unknown', summary);

    const response = await askOpencode(systemPrompt, userMsg);
    const { text, actions } = parseActions(response);

    // Execute actions
    const results: string[] = [];
    for (const action of actions) {
      const result = await executeAction(action, projectId);
      results.push(result);
    }

    let reply = text;
    if (results.length > 0) {
      reply += '\n\n' + results.map(r => `_${r}_`).join('\n');
    }

    // Telegram Markdown has a 4096 char limit
    if (reply.length > 4000) reply = reply.slice(0, 4000) + '...';

    await bot.api.editMessageText(chatId, thinking.message_id, reply || 'Done.', { parse_mode: 'Markdown' }).catch(async () => {
      // Markdown parse can fail on unescaped chars; retry as plain text
      await bot.api.editMessageText(chatId, thinking.message_id, reply || 'Done.');
    });
  } catch (err: any) {
    console.error('[bot] Error:', err.message);
    await bot.api.editMessageText(chatId, thinking.message_id, `Error: ${err.message}`).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

bot.start({
  onStart: () => console.log('[bot] WorkStream Telegram bot started'),
});

process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
process.on('SIGINT', () => { bot.stop(); process.exit(0); });
