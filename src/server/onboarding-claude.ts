import { type Check, run } from './onboarding-check.js';

export function appendClaudeChecks(checks: Check[]): void {
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
}
