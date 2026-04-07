import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireFlowAccess, routeParam } from '../authz.js';
import { normalizeFlowStep, withSortedFlowSteps } from '../flow-steps.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';
import { validateStepPayload } from './flow-validation.js';

export const flowStepRoutes = Router();

flowStepRoutes.put('/api/flows/:id/steps', requireAuth, async (req, res) => {
  const flowId = routeParam(req.params.id);
  const { steps } = req.body;
  const stepsError = validateStepPayload(steps);
  if (stepsError) return res.status(400).json({ error: stepsError });

  const access = await requireFlowAccess(req, res, flowId, 'id, project_id');
  if (!access) return;

  const stepRows = (steps as unknown[]).map((step, i) => normalizeFlowStep(step, i));
  if (stepRows.some(step => !step.name)) return res.status(400).json({ error: 'Each step requires a name' });

  const { error: replaceErr } = await supabase.rpc('replace_flow_steps', {
    p_flow_id: flowId,
    p_steps: stepRows,
  });
  if (replaceErr) return res.status(400).json({ error: replaceErr.message });

  const { data, error: fetchError } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('id', flowId)
    .single();
  if (fetchError) return res.status(400).json({ error: fetchError.message });
  const sortedFlow = withSortedFlowSteps(data);
  broadcast(access.projectId, { type: 'flow_changed', flow: sortedFlow });
  res.json(sortedFlow);
});
