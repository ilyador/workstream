import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { isMissingRowError, requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';

export const workstreamCreateRouter = Router();

workstreamCreateRouter.post('/api/workstreams', requireAuth, async (req, res) => {
  const { project_id, name, description, has_code } = req.body;
  if (typeof project_id !== 'string' || project_id.length === 0) return res.status(400).json({ error: 'project_id required' });
  if (typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: 'name required' });
  if (description != null && typeof description !== 'string') return res.status(400).json({ error: 'description must be a string' });
  if (has_code != null && typeof has_code !== 'boolean') return res.status(400).json({ error: 'has_code must be a boolean' });
  if (!await requireProjectMember(req, res, project_id)) return;

  const { data: maxWs, error: maxWsError } = await supabase
    .from('workstreams')
    .select('position')
    .eq('project_id', project_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();
  if (maxWsError && !isMissingRowError(maxWsError)) return res.status(400).json({ error: maxWsError.message });

  const insert: Record<string, unknown> = {
    project_id,
    name: name.trim(),
    position: (maxWs?.position ?? 0) + 1,
  };
  if (description !== undefined) insert.description = description;
  if (has_code !== undefined) insert.has_code = has_code;

  const { data, error } = await supabase
    .from('workstreams')
    .insert(insert)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
