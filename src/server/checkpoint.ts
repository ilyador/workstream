import { execFileSync } from 'child_process';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 15000 }).trim();
}

export interface CheckpointInfo {
  jobId: string;
  commitSha: string;
  headSha: string;
}

export function createCheckpoint(localPath: string, jobId: string): CheckpointInfo {
  const headSha = git(['rev-parse', 'HEAD'], localPath);

  // Stage everything including untracked
  git(['add', '-A'], localPath);

  // Create checkpoint commit
  git(['commit', '--allow-empty', '-m', `codesync-checkpoint-before:${jobId}`], localPath);

  // Save the commit as a ref
  const commitSha = git(['rev-parse', 'HEAD'], localPath);
  git(['update-ref', `refs/codesync/checkpoints/${jobId}`, commitSha], localPath);

  // Undo the commit but keep files as they were (mixed reset)
  git(['reset', '--mixed', 'HEAD~1'], localPath);

  return { jobId, commitSha, headSha };
}

export function revertToCheckpoint(localPath: string, jobId: string): { reverted: boolean } {
  const ref = `refs/codesync/checkpoints/${jobId}`;

  // Verify checkpoint exists
  try {
    git(['rev-parse', '--verify', ref], localPath);
  } catch {
    throw new Error('No checkpoint found for this job');
  }

  // Restore all tracked files from the checkpoint
  git(['checkout', ref, '--', '.'], localPath);

  // Remove any new files Claude created that weren't in the checkpoint
  git(['clean', '-fd'], localPath);

  // Unstage everything (restore to working directory state)
  git(['reset'], localPath);

  // Delete the checkpoint ref
  git(['update-ref', '-d', ref], localPath);

  return { reverted: true };
}

export function deleteCheckpoint(localPath: string, jobId: string): void {
  try {
    git(['update-ref', '-d', `refs/codesync/checkpoints/${jobId}`], localPath);
  } catch { /* ignore if ref doesn't exist */ }
}
