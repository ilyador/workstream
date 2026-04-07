import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireExactRegisteredLocalPath, requireWorkstreamAccess, stringField } from '../authz.js';
import { git } from '../git-utils.js';
import { supabase } from '../supabase.js';
import { errorMessage, pushAndCreatePr, runWorkstreamReview } from './git-workstream-pr.js';

export const gitWorkstreamRouter = Router();

gitWorkstreamRouter.post('/api/git/workstream-review-pr', requireAuth, async (req, res) => {
  const { workstreamId, localPath } = req.body;
  if (typeof workstreamId !== 'string') return res.status(400).json({ error: 'workstreamId is required' });

  const access = await requireWorkstreamAccess(req, res, workstreamId, 'id, name, project_id');
  if (!access) return;
  const authorizedLocalPath = requireExactRegisteredLocalPath(res, access.member, localPath);
  if (!authorizedLocalPath) return;

  const wsName = stringField(access.record, 'name');
  if (!wsName) return res.status(400).json({ error: 'Workstream name is required' });

  try {
    const { error: updateError } = await supabase.from('workstreams').update({ status: 'reviewing' }).eq('id', workstreamId);
    if (updateError) return res.status(400).json({ error: updateError.message });
    res.json({ ok: true, status: 'reviewing' });

    const stdout = await runWorkstreamReview(authorizedLocalPath);

    const { error: outputUpdateError } = await supabase.from('workstreams').update({ review_output: stdout.substring(0, 50000) }).eq('id', workstreamId);
    if (outputUpdateError) throw new Error(outputUpdateError.message);

    try {
      await git(['add', '-A'], authorizedLocalPath);
      await git(['commit', '-m', 'workstream: apply code review fixes'], authorizedLocalPath);
    } catch {
      // Nothing to commit is fine after an automated review.
    }

    await pushAndCreatePr(workstreamId, wsName, authorizedLocalPath, '_Code reviewed and fixes applied automatically by WorkStream._');
  } catch (error) {
    const { error: updateError } = await supabase.from('workstreams').update({ status: 'review_failed', review_output: `Error: ${errorMessage(error)}` }).eq('id', workstreamId);
    if (updateError) console.error('[review-pr] Failed to mark review failure:', updateError.message);
    console.error('[review-pr] Failed:', errorMessage(error));
  }
});

gitWorkstreamRouter.post('/api/git/workstream-pr', requireAuth, async (req, res) => {
  const { workstreamId, localPath } = req.body;
  if (typeof workstreamId !== 'string') return res.status(400).json({ error: 'workstreamId is required' });

  const access = await requireWorkstreamAccess(req, res, workstreamId, 'id, name, project_id');
  if (!access) return;
  const authorizedLocalPath = requireExactRegisteredLocalPath(res, access.member, localPath);
  if (!authorizedLocalPath) return;

  const wsName = stringField(access.record, 'name');
  if (!wsName) return res.status(400).json({ error: 'Workstream name is required' });

  try {
    const prUrl = await pushAndCreatePr(workstreamId, wsName, authorizedLocalPath);
    res.json({ ok: true, prUrl });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});
