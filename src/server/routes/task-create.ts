import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, isMissingRowError, requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';
import { validateTaskReferences, validateTaskScalars, validateTaskShape } from './task-validation.js';

export const taskCreateRouter = Router();

taskCreateRouter.post('/api/tasks', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { project_id, title, workstream_id } = req.body;
  if (typeof project_id !== 'string' || project_id.length === 0) return res.status(400).json({ error: 'project_id required' });
  if (typeof title !== 'string' || title.trim().length === 0) return res.status(400).json({ error: 'title required' });
  const member = await requireProjectMember(req, res, project_id);
  if (!member) return;
  const taskInput = { ...req.body };
  const shapeError = validateTaskShape(taskInput) || validateTaskScalars(taskInput);
  if (shapeError) return res.status(400).json({ error: shapeError });
  const referenceError = await validateTaskReferences(taskInput, project_id);
  if (referenceError) return res.status(400).json({ error: referenceError });

  let posQuery = supabase
    .from('tasks')
    .select('position')
    .eq('project_id', project_id);
  if (workstream_id) {
    posQuery = posQuery.eq('workstream_id', workstream_id);
  } else {
    posQuery = posQuery.is('workstream_id', null);
  }
  const { data: maxTask, error: maxTaskError } = await posQuery
    .order('position', { ascending: false })
    .limit(1)
    .single();
  if (maxTaskError && !isMissingRowError(maxTaskError)) return res.status(400).json({ error: maxTaskError.message });

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id,
      title: title.trim(),
      description: taskInput.description || '',
      type: taskInput.type || 'feature',
      mode: taskInput.mode || 'ai',
      effort: taskInput.effort || 'max',
      multiagent: taskInput.multiagent || 'auto',
      assignee: taskInput.assignee || null,
      auto_continue: taskInput.auto_continue !== undefined ? taskInput.auto_continue : true,
      images: taskInput.images || [],
      workstream_id: taskInput.workstream_id || null,
      flow_id: taskInput.flow_id || null,
      priority: taskInput.priority || 'backlog',
      chaining: taskInput.chaining || 'none',
      position: (maxTask?.position || 0) + 1,
      created_by: userId,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
