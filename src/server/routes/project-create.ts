import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { asRecord, getUserId, normalizeRegisteredLocalPath, stringField } from '../authz.js';
import { persistSupabaseConfig } from '../env-config.js';
import { createDefaultFlows } from '../flow-steps.js';
import { supabase } from '../supabase.js';

export const projectCreateRouter = Router();

projectCreateRouter.post('/api/projects', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { name, supabase_config, local_path } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (local_path != null && typeof local_path !== 'string') {
    return res.status(400).json({ error: 'local_path must be a string' });
  }
  const initialLocalPath = typeof local_path === 'string' ? local_path.trim() : '';
  const normalizedLocalPath = initialLocalPath ? normalizeRegisteredLocalPath(initialLocalPath) : {};
  if (normalizedLocalPath.error) return res.status(400).json({ error: normalizedLocalPath.error });

  if (supabase_config) {
    try {
      persistSupabaseConfig(supabase_config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to persist supabase config';
      return res.status(400).json({ error: message });
    }
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ name: name.trim(), created_by: userId })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  const projectRecord = asRecord(project);
  const projectId = projectRecord ? stringField(projectRecord, 'id') : null;
  if (!projectId) return res.status(500).json({ error: 'Created project is missing id' });

  const { error: memberError } = await supabase.from('project_members').insert({
    project_id: projectId,
    user_id: userId,
    role: 'admin',
    local_path: normalizedLocalPath.path || null,
  });
  if (memberError) {
    const { error: cleanupError } = await supabase.from('projects').delete().eq('id', projectId);
    if (cleanupError) console.error(`[projects] Failed to clean up project ${projectId}:`, cleanupError.message);
    return res.status(400).json({ error: memberError.message });
  }

  try {
    await createDefaultFlows(projectId);
  } catch (error) {
    console.warn('Failed to seed default flows:', error instanceof Error ? error.message : error);
  }

  res.json(project);
});
