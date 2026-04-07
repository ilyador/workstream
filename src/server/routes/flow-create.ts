import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { isMissingRowError, requireProjectMember } from '../authz.js';
import { normalizeFlowStep, withSortedFlowSteps } from '../flow-steps.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';
import { validateOptionalString, validateStepPayload } from './flow-validation.js';

export const flowCreateRouter = Router();

flowCreateRouter.post('/api/flows', requireAuth, async (req, res) => {
  const { project_id, name, description, icon, agents_md, steps } = req.body;
  if (typeof project_id !== 'string' || !project_id || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'project_id and name required' });
  if (!await requireProjectMember(req, res, project_id)) return;
  const bodyError = validateOptionalString(description, 'description')
    || validateOptionalString(icon, 'icon')
    || validateOptionalString(agents_md, 'agents_md')
    || validateStepPayload(steps);
  if (bodyError) return res.status(400).json({ error: bodyError });

  const { data: maxFlow, error: maxFlowError } = await supabase
    .from('flows')
    .select('position')
    .eq('project_id', project_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();
  if (maxFlowError && !isMissingRowError(maxFlowError)) return res.status(400).json({ error: maxFlowError.message });

  const { data: flow, error } = await supabase
    .from('flows')
    .insert({ project_id, name: name.trim(), description: description || '', icon: icon || 'bot', agents_md: agents_md || null, position: (maxFlow?.position ?? -1) + 1 })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (Array.isArray(steps) && steps.length > 0) {
    const stepRows = steps.map((step, i: number) => ({ ...normalizeFlowStep(step, i), flow_id: flow.id }));
    if (stepRows.some(step => !step.name)) {
      const { error: cleanupError } = await supabase.from('flows').delete().eq('id', flow.id);
      if (cleanupError) console.error(`[flows] Failed to clean up invalid flow ${flow.id}:`, cleanupError.message);
      return res.status(400).json({ error: 'Each step requires a name' });
    }
    const { error: stepErr } = await supabase.from('flow_steps').insert(stepRows);
    if (stepErr) {
      const { error: cleanupError } = await supabase.from('flows').delete().eq('id', flow.id);
      if (cleanupError) console.error(`[flows] Failed to clean up incomplete flow ${flow.id}:`, cleanupError.message);
      return res.status(400).json({ error: stepErr.message });
    }
  }

  const { data: full, error: fullError } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('id', flow.id)
    .single();
  if (fullError) return res.status(400).json({ error: fullError.message });
  const sortedFlow = withSortedFlowSteps(full);
  broadcast(project_id, { type: 'flow_changed', flow: sortedFlow });
  res.json(sortedFlow);
});
