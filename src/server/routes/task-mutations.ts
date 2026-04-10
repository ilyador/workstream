import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireTaskAccess, routeParam } from '../authz.js';
import { asRecord, stringField } from '../authz-shared.js';
import { findDefaultFlowId } from '../flow-resolution.js';
import { resolveTaskProjectDataAllowed } from '../project-data-settings.js';
import { hasActiveTaskJob, supabase } from '../supabase.js';
import { maybeQueueTaskAutoContinue } from './task-auto-continue.js';
import { validateTaskReferences, validateTaskScalars, validateTaskShape } from './task-validation.js';

const TASK_UPDATE_FIELDS = ['title', 'description', 'type', 'mode', 'effort', 'multiagent', 'status', 'assignee', 'workstream_id', 'position', 'images', 'followup_notes', 'auto_continue', 'allow_project_data', 'priority', 'flow_id', 'chaining'];

export const taskMutationsRouter = Router();

taskMutationsRouter.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = routeParam(req.params.id);
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id, mode, type, flow_id, allow_project_data');
  if (!access) return;
  const currentTask = asRecord(access.record) || {};
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
  if (typeof updates.status === 'string') {
    try {
      const active = await hasActiveTaskJob(taskId);
      if (active) return res.status(409).json({ error: `Cannot change task status while job ${active.id} is ${active.status}` });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check active jobs' });
    }
  }
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  } else if (typeof updates.status === 'string' && updates.status !== 'done') {
    updates.completed_at = null;
  }
  const nextMode = typeof updates.mode === 'string' ? updates.mode : (stringField(currentTask, 'mode') || 'ai');
  const nextType = typeof updates.type === 'string' ? updates.type : (stringField(currentTask, 'type') || 'feature');
  const nextFlowId = typeof updates.flow_id === 'string'
    ? updates.flow_id
    : (stringField(currentTask, 'flow_id') || null);
  if (nextMode === 'ai') {
    const requestedProjectData = typeof updates.allow_project_data === 'boolean'
      ? updates.allow_project_data
      : currentTask.allow_project_data === true;
    let resolvedFlowId: string | null;
    let allowProjectData: boolean;
    try {
      resolvedFlowId = nextFlowId || await findDefaultFlowId(access.projectId, nextType);
      allowProjectData = await resolveTaskProjectDataAllowed(access.projectId, requestedProjectData);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to resolve task settings' });
    }
    if (!resolvedFlowId) return res.status(400).json({ error: 'AI tasks require a flow' });
    updates.flow_id = resolvedFlowId;
    updates.allow_project_data = allowProjectData;
  } else {
    updates.flow_id = null;
    updates.allow_project_data = false;
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
