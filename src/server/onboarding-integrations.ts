import { type Check, run } from './onboarding-check.js';

export function appendIntegrationChecks(checks: Check[]): void {
  const gh = run('which', ['gh']);
  checks.push({
    id: 'gh',
    label: 'GitHub CLI',
    ok: gh.ok,
    help: 'Install GitHub CLI: https://cli.github.com - needed for Branch+PR feature',
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

  checks.push({
    id: 'telegram',
    label: 'Telegram bot',
    ok: !!process.env.TELEGRAM_BOT_TOKEN,
    help: 'Set TELEGRAM_BOT_TOKEN in .env to enable the Telegram bot. Create one via @BotFather in Telegram.',
    required: false,
  });
}
