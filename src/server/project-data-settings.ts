import { asRecord, stringField } from './authz.js';
import { supabase } from './supabase.js';
import { DEFAULT_PROJECT_DATA_SETTINGS, normalizeProjectDataBackend, type ProjectDataSettings } from '../shared/project-data.js';

export const PROJECT_DATA_SELECT = [
  'project_data_enabled',
  'project_data_backend',
  'project_data_base_url',
  'project_data_embedding_model',
  'project_data_top_k',
].join(', ');

export function projectDataSettingsFromRecord(value: unknown): ProjectDataSettings {
  const record = asRecord(value) || {};
  return {
    enabled: record.project_data_enabled === true,
    backend: normalizeProjectDataBackend(record.project_data_backend),
    baseUrl: stringField(record, 'project_data_base_url') || DEFAULT_PROJECT_DATA_SETTINGS.baseUrl,
    embeddingModel: stringField(record, 'project_data_embedding_model') || DEFAULT_PROJECT_DATA_SETTINGS.embeddingModel,
    topK: typeof record.project_data_top_k === 'number' && Number.isInteger(record.project_data_top_k) && record.project_data_top_k > 0
      ? record.project_data_top_k
      : DEFAULT_PROJECT_DATA_SETTINGS.topK,
  };
}

export async function loadProjectDataSettings(projectId: string): Promise<ProjectDataSettings> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_DATA_SELECT)
    .eq('id', projectId)
    .single();
  if (error) throw new Error(`Failed to load Project Data settings: ${error.message}`);
  return projectDataSettingsFromRecord(data);
}

export async function resolveTaskProjectDataAllowed(projectId: string, requested: boolean): Promise<boolean> {
  if (!requested) return false;
  const settings = await loadProjectDataSettings(projectId);
  return settings.enabled;
}
