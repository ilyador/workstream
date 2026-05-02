import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Run a git command asynchronously. Returns trimmed stdout. */
export async function git(args: string[], cwd: string, timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf-8', timeout });
  return stdout.trim();
}

/** Run a git command synchronously. Returns trimmed stdout. Use only in worker callbacks. */
export function gitSync(args: string[], cwd: string, timeout = 15000): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout }).toString().trim();
}

/** Slugify a string for branch names and directory paths. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

/** Format the standard workstream commit message. */
export function commitMessage(taskType: string, taskTitle: string): string {
  return `workstream(${taskType}): ${taskTitle}`;
}

/** Get full diff including untracked files. Stages temporarily, then unstages. */
export function stagedDiff(cwd: string): string {
  try {
    execFileSync('git', ['add', '-A'], { cwd, timeout: 5000 });
    return execFileSync('git', ['diff', '--staged', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 10000 }).toString().trim();
  } finally {
    try { execFileSync('git', ['reset'], { cwd, timeout: 5000 }); } catch { /* best effort */ }
  }
}

/** Get diff stat including untracked files. Returns parsed stats. */
export function stagedDiffStat(cwd: string): { filesChanged: number; linesAdded: number; linesRemoved: number; changedFiles: string[] } {
  let stat = '';
  try {
    execFileSync('git', ['add', '-A'], { cwd, timeout: 5000 });
    stat = execFileSync('git', ['diff', '--stat', '--staged', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 5000 }).toString().trim();
  } finally {
    try { execFileSync('git', ['reset'], { cwd, timeout: 5000 }); } catch { /* best effort */ }
  }
  let filesChanged = 0, linesAdded = 0, linesRemoved = 0;
  const changedFiles: string[] = [];
  const match = stat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
  if (match) { filesChanged = parseInt(match[1]) || 0; linesAdded = parseInt(match[2]) || 0; linesRemoved = parseInt(match[3]) || 0; }
  const lines = stat.split('\n').slice(0, -1);
  for (const line of lines) { const fm = line.match(/^\s*(.+?)\s+\|/); if (fm) changedFiles.push(fm[1].trim()); }
  return { filesChanged, linesAdded, linesRemoved, changedFiles };
}

/**
 * Fingerprint repository changes relative to a checkpoint ref plus the current
 * worktree. This catches both committed edits and uncommitted/untracked edits.
 */
export function repositoryChangeFingerprint(cwd: string, baseRef: string): string {
  let committedDiff = '';
  try {
    execFileSync('git', ['rev-parse', '--verify', baseRef], { cwd, timeout: 5000 });
    committedDiff = execFileSync('git', ['diff', '--binary', '--full-index', baseRef, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    }).toString().trim();
  } catch {
    committedDiff = '';
  }

  const worktreeDiff = stagedDiff(cwd);
  return [committedDiff, worktreeDiff].filter(Boolean).join('\n\n--- worktree ---\n');
}

/** Stage all changes and commit. Resolves silently if nothing to commit. */
export async function autoCommit(localPath: string, taskType: string, taskTitle: string): Promise<void> {
  await git(['add', '-A'], localPath);
  try {
    await git(['commit', '-m', commitMessage(taskType, taskTitle)], localPath);
  } catch {
    // nothing to commit is ok
  }
}
