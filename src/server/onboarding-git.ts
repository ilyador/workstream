import { type Check, run } from './onboarding-check.js';

export function appendGitChecks(checks: Check[], localPath?: string): void {
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
}
