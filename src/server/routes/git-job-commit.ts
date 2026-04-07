import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireAuthorizedLocalPath, requireJobAccess, stringField } from '../authz.js';
import { commitMessage, git } from '../git-utils.js';
import { errorMessage, nestedRecord } from './git-job-utils.js';

export const gitJobCommitRouter = Router();

gitJobCommitRouter.post('/api/git/commit', requireAuth, async (req, res) => {
  const { jobId } = req.body;
  if (typeof jobId !== 'string') return res.status(400).json({ error: 'jobId is required' });

  const access = await requireJobAccess(req, res, jobId, '*, tasks(title, type)');
  if (!access) return;
  const authorizedLocalPath = requireAuthorizedLocalPath(res, access.member, stringField(access.record, 'local_path'), 'job local_path');
  if (!authorizedLocalPath) return;

  try {
    const task = nestedRecord(access.record, 'tasks');
    const type = task ? stringField(task, 'type') : null;
    const title = task ? stringField(task, 'title') : null;
    if (!type || !title) return res.status(400).json({ error: 'Job task is missing type or title' });

    const message = commitMessage(type, title);
    await git(['add', '-A'], authorizedLocalPath);
    const sha = await git(['commit', '-m', message], authorizedLocalPath);

    res.json({ ok: true, sha, message });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});
