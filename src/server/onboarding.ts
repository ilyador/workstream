import { appendClaudeChecks } from './onboarding-claude.js';
import { type Check } from './onboarding-check.js';
import { appendGitChecks } from './onboarding-git.js';
import { appendIntegrationChecks } from './onboarding-integrations.js';
import { appendLmStudioChecks } from './onboarding-lm-studio.js';

export async function runChecks(localPath?: string): Promise<Check[]> {
  const checks: Check[] = [];

  appendClaudeChecks(checks);
  appendGitChecks(checks, localPath);
  appendIntegrationChecks(checks);
  await appendLmStudioChecks(checks);

  return checks;
}
