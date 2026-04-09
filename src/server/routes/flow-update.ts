import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireFlowAccess, routeParam } from '../authz.js';
import { normalizeFlowStep, resolveFlowStepProviderConfigs, withSortedFlowSteps } from '../flow-steps.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';
import { normalizeFlowProviderBinding } from '../../shared/flow-provider-binding.js';
import { validateStepsForBinding } from './flow-validation.js';

const FLOW_UPDATE_FIELDS = ['name', 'description', 'icon', 'agents_md', 'default_types', 'position', 'provider_binding'];

export const flowUpdateRouter = Router();

flowUpdateRouter.patch('/api/flows/:id', requireAuth, async (req, res) => {
  const flowId = routeParam(req.params.id);
  const access = await requireFlowAccess(req, res, flowId, 'id, project_id');
  if (!access) return;

  const updates: Record<string, unknown> = {};
  for (const key of FLOW_UPDATE_FIELDS) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No supported fields to update' });

  let resolvedSteps: Array<Record<string, unknown>> | null = null;
  if ('name' in updates) {
    if (typeof updates.name !== 'string' || updates.name.trim().length === 0) return res.status(400).json({ error: 'name cannot be empty' });
    updates.name = updates.name.trim();
  }
  if ('description' in updates && updates.description != null && typeof updates.description !== 'string') {
    return res.status(400).json({ error: 'description must be a string' });
  }
  if ('icon' in updates && (typeof updates.icon !== 'string' || updates.icon.trim().length === 0)) {
    return res.status(400).json({ error: 'icon must be a non-empty string' });
  }
  if ('agents_md' in updates && updates.agents_md != null && typeof updates.agents_md !== 'string') {
    return res.status(400).json({ error: 'agents_md must be a string' });
  }
  if ('default_types' in updates && (!Array.isArray(updates.default_types) || !updates.default_types.every(type => typeof type === 'string' && type.trim().length > 0))) {
    return res.status(400).json({ error: 'default_types must be an array of non-empty strings' });
  }
  if ('provider_binding' in updates) {
    if (typeof updates.provider_binding !== 'string' || !['task_selected', 'flow_locked'].includes(updates.provider_binding)) {
      return res.status(400).json({ error: 'provider_binding must be "task_selected" or "flow_locked"' });
    }
    updates.provider_binding = normalizeFlowProviderBinding(updates.provider_binding);
    const { data: flowRows, error: flowError } = await supabase
      .from('flows')
      .select('flow_steps(*)')
      .eq('id', flowId)
      .single();
    if (flowError) return res.status(400).json({ error: flowError.message });
    const nextBinding = normalizeFlowProviderBinding(updates.provider_binding);
    const currentSteps = Array.isArray(flowRows?.flow_steps)
      ? flowRows.flow_steps.map((step, index) => normalizeFlowStep(step, index, nextBinding))
      : [];
    const validationError = validateStepsForBinding(nextBinding, currentSteps);
    if (validationError) return res.status(400).json({ error: validationError });
    try {
      resolvedSteps = await resolveFlowStepProviderConfigs(access.projectId, nextBinding, currentSteps);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve flow step providers';
      return res.status(400).json({ error: message });
    }
  }
  if (
    'position' in updates
    && updates.position != null
    && (typeof updates.position !== 'number' || updates.position < 0)
  ) {
    return res.status(400).json({ error: 'position must be a non-negative number' });
  }
  if (resolvedSteps) {
    const { error: replaceErr } = await supabase.rpc('replace_flow_steps', {
      p_flow_id: flowId,
      p_steps: resolvedSteps,
    });
    if (replaceErr) return res.status(400).json({ error: replaceErr.message });
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('flows')
    .update(updates)
    .eq('id', flowId)
    .select('*, flow_steps(*)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  const sortedFlow = withSortedFlowSteps(data);
  broadcast(access.projectId, { type: 'flow_changed', flow: sortedFlow });
  res.json(sortedFlow);
});
