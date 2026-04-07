import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireAnyExactRegisteredLocalPath } from '../authz.js';
import { git } from '../git-utils.js';
import { errorMessage } from './git-job-utils.js';

export const gitJobPushRouter = Router();

gitJobPushRouter.post('/api/git/push', requireAuth, async (req, res) => {
  const authorizedLocalPath = await requireAnyExactRegisteredLocalPath(req, res, req.body.localPath);
  if (!authorizedLocalPath) return;

  try {
    const output = await git(['push'], authorizedLocalPath, 30000);
    const branch = await git(['branch', '--show-current'], authorizedLocalPath);
    res.json({ ok: true, branch, output });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});
