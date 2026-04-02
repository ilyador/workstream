import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 15000 }).trim();
}

/**
 * Ensure a git worktree exists for the given workstream slug.
 * Creates `<projectPath>/.worktrees/<slug>` on branch `codesync/<slug>`.
 * Returns the absolute worktree path.
 */
export function ensureWorktree(projectPath: string, workstreamSlug: string): string {
  const worktreeDir = path.join(projectPath, '.worktrees');
  const worktreePath = path.join(worktreeDir, workstreamSlug);
  const branch = `codesync/${workstreamSlug}`;

  // Already set up — just return the path
  if (existsSync(path.join(worktreePath, '.git'))) {
    return worktreePath;
  }

  // Ensure .worktrees directory exists
  if (!existsSync(worktreeDir)) {
    execFileSync('mkdir', ['-p', worktreeDir]);
  }

  // Create the branch if it doesn't exist (based off current HEAD)
  try {
    git(['rev-parse', '--verify', branch], projectPath);
  } catch {
    git(['branch', branch], projectPath);
  }

  // Create the worktree
  git(['worktree', 'add', worktreePath, branch], projectPath);

  return worktreePath;
}

/**
 * Remove a worktree and optionally delete its branch.
 */
export function cleanupWorktree(projectPath: string, workstreamSlug: string): void {
  const worktreePath = path.join(projectPath, '.worktrees', workstreamSlug);
  const branch = `codesync/${workstreamSlug}`;

  // Remove the worktree
  try {
    git(['worktree', 'remove', worktreePath, '--force'], projectPath);
  } catch {
    // Worktree may already be gone
  }

  // Delete the local branch (merged into main by now via PR)
  try {
    git(['branch', '-d', branch], projectPath);
  } catch {
    // Branch may not exist or may not be fully merged — that's ok
  }
}
