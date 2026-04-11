import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';
import { slugifyCustomTypeName, validateCustomTypeInput } from './custom-type-validation.js';

export const customTypeCreateRouter = Router();

customTypeCreateRouter.post('/api/custom-types', requireAuth, async (req, res) => {
  const { project_id, name, description } = req.body;
  if (typeof project_id !== 'string' || !project_id || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'project_id and name required' });
  if (!await requireProjectMember(req, res, project_id)) return;

  const inputError = validateCustomTypeInput({ description });
  if (inputError) return res.status(400).json({ error: inputError });

  const slug = slugifyCustomTypeName(name);
  if (!slug) return res.status(400).json({ error: 'name is invalid' });
  const { data, error } = await supabase
    .from('custom_task_types')
    .insert({
      project_id,
      name: slug,
      description: description || '',
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
