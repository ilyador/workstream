import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireFlowAccess, routeParam } from '../authz.js';
import { normalizeFlowStep, resolveFlowStepProviderConfigs, withSortedFlowSteps } from '../flow-steps.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';
import { validateStepPayload, validateStepsForBinding } from './flow-validation.js';

export const flowStepRoutes = Router();

flowStepRoutes.put('/api/flows/:id/steps', requireAuth, async (req, res) => {
  const flowId = routeParam(req.params.id);
  const { steps } = req.body;
  const stepsError = validateStepPayload(steps);
  if (stepsError) return res.status(400).json({ error: stepsError });

  const access = await requireFlowAccess(req, res, flowId, 'id, project_id');
  if (!access) return;

  const { data: flowRow, error: flowError } = await supabase
    .from('flows')
    .select('provider_binding')
    .eq('id', flowId)
    .single();
  if (flowError) return res.status(400).json({ error: flowError.message });
  const normalizedStepRows = (steps as unknown[]).map((step, i) => normalizeFlowStep(
    step,
    i,
    typeof flowRow?.provider_binding === 'string' ? flowRow.provider_binding : null,
  ));
  let stepRows;
  try {
    stepRows = await resolveFlowStepProviderConfigs(
      access.projectId,
      typeof flowRow?.provider_binding === 'string' ? flowRow.provider_binding : null,
      normalizedStepRows,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve flow step providers';
    return res.status(400).json({ error: message });
  }
  if (stepRows.some(step => !step.name)) return res.status(400).json({ error: 'Each step requires a name' });
  const bindingError = validateStepsForBinding(typeof flowRow?.provider_binding === 'string' ? flowRow.provider_binding : null, stepRows);
  if (bindingError) return res.status(400).json({ error: bindingError });

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
