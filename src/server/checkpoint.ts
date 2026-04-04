import { gitSync as git } from './git-utils.js';

export interface CheckpointInfo {
  jobId: string;
  commitSha: string;
  headSha: string;
  branch: string | null;
}

export function createCheckpoint(localPath: string, jobId: string): CheckpointInfo {
  const headSha = git(['rev-parse', 'HEAD'], localPath);

  // Save current branch name (null if detached HEAD)
  let branch: string | null = null;
  try {
    branch = git(['symbolic-ref', '--short', 'HEAD'], localPath);
  } catch {
    // Detached HEAD — branch is null
  }

  // Stage everything including untracked
  git(['add', '-A'], localPath);

  // Create checkpoint commit
  git(['commit', '--allow-empty', '-m', `workstream-checkpoint-before:${jobId}`], localPath);

  // Save the commit as a ref (includes branch info in the ref for restore)
  const commitSha = git(['rev-parse', 'HEAD'], localPath);
  git(['update-ref', `refs/workstream/checkpoints/${jobId}`, commitSha], localPath);

  // Also save the branch name as a separate ref note
  if (branch) {
    git(['config', `workstream.checkpoint.${jobId}.branch`, branch], localPath);
  }

  // Undo the commit but keep files as they were (mixed reset)
  git(['reset', '--mixed', 'HEAD~1'], localPath);

  return { jobId, commitSha, headSha, branch };
}

export function revertToCheckpoint(localPath: string, jobId: string): { reverted: boolean } {
  const ref = `refs/workstream/checkpoints/${jobId}`;

  // Verify checkpoint exists
  try {
    git(['rev-parse', '--verify', ref], localPath);
  } catch {
    throw new Error('No checkpoint found for this job');
  }

  // Restore all tracked files from the checkpoint
  git(['checkout', ref, '--', '.'], localPath);

  // Remove any new files Opencode created that weren't in the checkpoint
  // But only files — don't remove directories that might have been there
  try {
    git(['clean', '-fd', '--exclude=.codesync'], localPath);
  } catch {
    // git clean can fail if there are permission issues — not fatal
  }

  // Unstage everything (restore to working directory state)
  git(['reset'], localPath);

  // Restore branch if we were on one
  try {
    const branch = git(['config', `workstream.checkpoint.${jobId}.branch`], localPath);
    if (branch) {
      // Make sure HEAD is on the right branch
      const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], localPath);
      if (currentBranch !== branch) {
        git(['checkout', branch], localPath);
      }
    }
  } catch {
    // No branch saved or checkout failed — leave HEAD where it is
  }

  // Clean up checkpoint ref and config
  deleteCheckpoint(localPath, jobId);

  return { reverted: true };
}

export function deleteCheckpoint(localPath: string, jobId: string): void {
  try {
    git(['update-ref', '-d', `refs/workstream/checkpoints/${jobId}`], localPath);
  } catch { /* ignore if ref doesn't exist */ }
  try {
    git(['config', '--unset', `workstream.checkpoint.${jobId}.branch`], localPath);
  } catch { /* ignore */ }
}
