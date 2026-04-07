import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { withSortedFlowSteps } from '../flow-steps.js';
import { supabase } from '../supabase.js';

export const flowListRouter = Router();

flowListRouter.get('/api/flows', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;

  const { data, error: flowErr } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('project_id', projectId)
    .order('position', { ascending: true });

  if (flowErr) {
    console.error('[flows] Error fetching flows:', flowErr.message);
    return res.status(500).json({ error: flowErr.message });
  }

  const flows = (data || []).map(withSortedFlowSteps);
  res.json(flows);
});
