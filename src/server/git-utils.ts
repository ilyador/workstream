import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Run a git command asynchronously. Returns trimmed stdout. */
export async function git(args: string[], cwd: string, timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf-8', timeout });
  return stdout.trim();
}

/** Run a git command synchronously. Returns trimmed stdout. Use only in worker callbacks. */
export function gitSync(args: string[], cwd: string, timeout = 15000): string {
  const { execFileSync } = require('child_process');
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout }).trim();
}

/** Slugify a string for branch names and directory paths. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

/** Format the standard codesync commit message. */
export function commitMessage(taskType: string, taskTitle: string): string {
  return `codesync(${taskType}): ${taskTitle}`;
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
