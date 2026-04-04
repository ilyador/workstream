import { execFileSync } from 'child_process';

interface Check {
  id: string;
  label: string;
  ok: boolean;
  help: string;
  required: boolean;
}

function run(cmd: string, args: string[] = []): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, { timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { ok: true, output };
  } catch {
    return { ok: false, output: '' };
  }
}

export async function runChecks(localPath?: string): Promise<Check[]> {
  const checks: Check[] = [];

  // Claude Code
  const claude = run('which', ['claude']);
  checks.push({
    id: 'claude',
    label: 'Claude Code',
    ok: claude.ok,
    help: 'Install Claude Code: https://claude.com/download',
    required: true,
  });

  if (claude.ok) {
    const ver = run('claude', ['--version']);
    checks.push({
      id: 'claude-auth',
      label: 'Claude Code authenticated',
      ok: ver.ok,
      help: 'Run `claude` in your terminal and log in with your Anthropic account',
      required: true,
    });
  }

  // Git
  const git = run('which', ['git']);
  checks.push({
    id: 'git',
    label: 'Git',
    ok: git.ok,
    help: 'Install git: https://git-scm.com/downloads',
    required: true,
  });

  if (git.ok) {
    const name = run('git', ['config', 'user.name']);
    const email = run('git', ['config', 'user.email']);
    checks.push({
      id: 'git-config',
      label: 'Git configured (user.name & email)',
      ok: name.ok && name.output.length > 0 && email.ok && email.output.length > 0,
      help: "Run `git config --global user.name 'Your Name'` and `git config --global user.email 'you@example.com'`",
      required: true,
    });
  }

  // GitHub CLI
  const gh = run('which', ['gh']);
  checks.push({
    id: 'gh',
    label: 'GitHub CLI',
    ok: gh.ok,
    help: 'Install GitHub CLI: https://cli.github.com — needed for Branch+PR feature',
    required: false,
  });

  if (gh.ok) {
    const auth = run('gh', ['auth', 'status']);
    checks.push({
      id: 'gh-auth',
      label: 'GitHub CLI authenticated',
      ok: auth.ok,
      help: 'Run `gh auth login` to authenticate with GitHub',
      required: false,
    });
  }

  // Telegram bot
  const botToken = !!process.env.TELEGRAM_BOT_TOKEN;
  checks.push({
    id: 'telegram',
    label: 'Telegram bot',
    ok: botToken,
    help: 'Set TELEGRAM_BOT_TOKEN in .env to enable the Telegram bot. Create one via @BotFather in Telegram.',
    required: false,
  });

  // Project git repo
  if (localPath) {
    const repo = run('git', ['-C', localPath, 'rev-parse', '--git-dir']);
    checks.push({
      id: 'git-repo',
      label: 'Project has git repo',
      ok: repo.ok,
      help: `Initialize a git repo: cd ${localPath} && git init`,
      required: true,
    });
  }

  // LM Studio (optional — for RAG doc search)
  const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://localhost:1234';
  let lmStudioOk = false;
  let modelsBody: any = null;
  try {
    const resp = await fetch(`${lmStudioUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
    lmStudioOk = resp.ok;
    if (resp.ok) modelsBody = await resp.json();
  } catch {}
  checks.push({
    id: 'lm-studio',
    label: 'LM Studio',
    ok: lmStudioOk,
    help: 'Start LM Studio server: lms server start — needed for AI doc search (RAG)',
    required: false,
  });

  if (lmStudioOk && modelsBody) {
    const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-nomic-embed-text-v1.5';
    const modelLoaded = modelsBody.data?.some((m: any) => m.id?.includes('nomic') || m.id?.includes('embed')) ?? false;
    checks.push({
      id: 'embedding-model',
      label: 'Embedding model loaded',
      ok: modelLoaded,
      help: `Load embedding model: lms load ${embeddingModel}`,
      required: false,
    });
  }

  return checks;
}
