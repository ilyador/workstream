import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { deleteCheckpoint } from '../checkpoint.js';
import {
  requireAuthorizedLocalPath,
  requireJobAccess,
  routeParam,
  stringField,
} from '../authz.js';
import { errorMessage } from './execution-helpers.js';
import { markJobApproved, recordApprovalLog, runApprovalFollowups } from './job-approve-effects.js';

export const jobApproveRouter = Router();

jobApproveRouter.post('/api/jobs/:id/approve', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId);
  if (!access) return;
  const job = access.record;
  if (job.status !== 'review') return res.status(400).json({ error: 'Job is not in review' });

  const localPath = requireAuthorizedLocalPath(res, access.member, stringField(job, 'local_path'), 'job local_path');
  if (!localPath) return;
  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });

  const now = new Date().toISOString();
  try {
    deleteCheckpoint(localPath, jobId);
  } catch (error) {
    console.warn(`[approve] Checkpoint cleanup failed for job ${jobId}:`, errorMessage(error, 'cleanup failed'));
  }

  const approvalError = await markJobApproved({ jobId, taskId, now });
  if (approvalError) return res.status(400).json({ error: approvalError });
  await recordApprovalLog(jobId);
  // Auto-continue needs the repo root, not the worktree from job.local_path,
  // so we don't queue nested worktrees.
  const projectRootPath = access.member.local_path;
  if (!projectRootPath) return res.status(500).json({ error: 'member.local_path missing after authorization' });
  await runApprovalFollowups({
    taskId,
    projectId: access.projectId,
    workDir: localPath,
    projectRootPath,
  });

  res.json({ ok: true });
});
