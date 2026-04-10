import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { gitSync } from './git-utils.js';

function shortWorkstreamId(workstreamId: string): string {
  return workstreamId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
}

export function workstreamRef(workstreamName: string, workstreamId: string): string {
  const suffix = shortWorkstreamId(workstreamId);
  return suffix ? `${workstreamName}-${suffix}` : workstreamName;
}

/**
 * Ensure a git worktree exists for the given workstream slug.
 * Creates `<projectPath>/.worktrees/<slug>` on branch `workstream/<slug>`.
 * Returns the absolute worktree path.
 */
export function ensureWorktree(projectPath: string, workstreamSlug: string, workstreamId: string): string {
  const refSlug = workstreamRef(workstreamSlug, workstreamId);
  const worktreeDir = path.join(projectPath, '.worktrees');
  const worktreePath = path.join(worktreeDir, refSlug);
  const branch = `workstream/${refSlug}`;

  // Already set up — just return the path
  if (existsSync(path.join(worktreePath, '.git'))) {
    return worktreePath;
  }

  // Ensure .worktrees directory exists (recursive avoids TOCTOU race)
  mkdirSync(worktreeDir, { recursive: true });

  // Clear stale git metadata for missing worktrees before adding a new one.
  try {
    gitSync(['worktree', 'prune'], projectPath);
  } catch {
    // best effort
  }

  // Create the branch if it doesn't exist (based off current HEAD)
  try {
    gitSync(['branch', branch], projectPath);
  } catch {
    // branch already exists — that's fine
  }

  // Create the worktree
  gitSync(['worktree', 'add', worktreePath, branch], projectPath);

  return worktreePath;
}

/**
 * Remove a worktree and optionally delete its branch.
 */
export function cleanupWorktree(projectPath: string, workstreamSlug: string, workstreamId: string): void {
  const refSlug = workstreamRef(workstreamSlug, workstreamId);
  const worktreePath = path.join(projectPath, '.worktrees', refSlug);
  const branch = `workstream/${refSlug}`;

  try {
    gitSync(['worktree', 'prune'], projectPath);
  } catch {
    // best effort
  }

  // Remove the worktree
  try {
    gitSync(['worktree', 'remove', worktreePath, '--force'], projectPath);
  } catch {
    // Worktree may already be gone
  }

  // Delete the local branch (merged into main by now via PR)
  try {
    gitSync(['branch', '-d', branch], projectPath);
  } catch {
    // Branch may not exist or may not be fully merged — that's ok
  }
}
