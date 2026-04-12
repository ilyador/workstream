import { gitSync as git } from './git-utils.js';

export interface CheckpointInfo {
  jobId: string;
  commitSha: string;
  headSha: string;
  branch: string | null;
}

// Defense in depth: job IDs are server-issued UUIDs today, but these values
// are interpolated into git ref names and config keys, so reject anything
// that could confuse git's arg parsing (leading dashes, dots, slashes, etc.)
// if a future code path ever sources jobId from untrusted input.
const JOB_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
function assertValidJobId(jobId: string): void {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error(`Invalid job id for checkpoint: ${JSON.stringify(jobId)}`);
  }
}

export function createCheckpoint(localPath: string, jobId: string): CheckpointInfo {
  assertValidJobId(jobId);
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
  assertValidJobId(jobId);
  const ref = `refs/workstream/checkpoints/${jobId}`;

  // Verify checkpoint exists
  try {
    git(['rev-parse', '--verify', ref], localPath);
  } catch {
    throw new Error('No checkpoint found for this job');
  }

  // Restore all tracked files from the checkpoint
  git(['checkout', ref, '--', '.'], localPath);

  // Remove any new files the job created that weren't in the checkpoint.
  // git clean can fail for legitimate reasons (permission denied on a file,
  // read-only filesystem on a subpath). We don't abort the revert — the
  // tracked files have already been restored above — but we surface the
  // error so operators can see when a revert left untracked residue behind.
  try {
    git(['clean', '-fd', '--exclude=.codesync'], localPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[checkpoint] git clean failed during revert for job ${jobId} (tracked files were restored; untracked residue may remain):`, message);
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
  assertValidJobId(jobId);
  try {
    git(['update-ref', '-d', `refs/workstream/checkpoints/${jobId}`], localPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[checkpoint] Failed to delete ref for job ${jobId}:`, message);
  }
  try {
    git(['config', '--unset', `workstream.checkpoint.${jobId}.branch`], localPath);
  } catch {
    // Config key may not exist; checkpoint refs are still cleaned up.
  }
}
