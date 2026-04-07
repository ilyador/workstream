import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireTaskAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { maybeQueueTaskAutoContinue } from './task-auto-continue.js';
import { validateTaskReferences, validateTaskScalars, validateTaskShape } from './task-validation.js';

const TASK_UPDATE_FIELDS = ['title', 'description', 'type', 'mode', 'effort', 'multiagent', 'status', 'assignee', 'workstream_id', 'position', 'images', 'followup_notes', 'auto_continue', 'priority', 'flow_id', 'chaining'];

export const taskMutationsRouter = Router();

taskMutationsRouter.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = routeParam(req.params.id);
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;
  const updates: Record<string, unknown> = {};
  for (const key of TASK_UPDATE_FIELDS) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No supported fields to update' });
  const shapeError = validateTaskShape(updates) || validateTaskScalars(updates);
  if (shapeError) return res.status(400).json({ error: shapeError });
  const referenceError = await validateTaskReferences(updates, access.projectId);
  if (referenceError) return res.status(400).json({ error: referenceError });
  if (typeof updates.title === 'string') updates.title = updates.title.trim();
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  } else if (typeof updates.status === 'string' && updates.status !== 'done') {
    updates.completed_at = null;
  }
  if (typeof updates.type === 'string' && !('flow_id' in updates)) {
    const { data: flows, error: flowsError } = await supabase.from('flows').select('id, default_types').eq('project_id', access.projectId);
    if (flowsError) return res.status(400).json({ error: flowsError.message });
    const match = flows?.find(f => (f.default_types || []).includes(updates.type));
    if (match) updates.flow_id = match.id;
  }
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (updates.status === 'done') await maybeQueueTaskAutoContinue(req, data);

  res.json(data);
});

taskMutationsRouter.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = routeParam(req.params.id);
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
