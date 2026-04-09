export type ProjectDataBackend = 'lmstudio' | 'ollama' | 'openai_compatible';

export const PROJECT_DATA_BACKENDS: Array<{ id: ProjectDataBackend; label: string }> = [
  { id: 'lmstudio', label: 'LM Studio' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'openai_compatible', label: 'OpenAI-Compatible' },
];

export interface ProjectDataSettings {
  enabled: boolean;
  backend: ProjectDataBackend;
  baseUrl: string;
  embeddingModel: string;
  topK: number;
}

export const DEFAULT_PROJECT_DATA_SETTINGS: ProjectDataSettings = {
  enabled: false,
  backend: 'lmstudio',
  baseUrl: 'http://localhost:1234/v1',
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5',
  topK: 5,
};

export interface ProjectDataReindexResult {
  total: number;
  ready: number;
  failed: number;
  error?: string;
}

export function normalizeProjectDataBackend(value: unknown): ProjectDataBackend {
  return value === 'ollama' || value === 'openai_compatible' || value === 'lmstudio'
    ? value
    : DEFAULT_PROJECT_DATA_SETTINGS.backend;
}

export function normalizeProjectDataSettings(value: unknown): ProjectDataSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const enabled = record.enabled === true;
  const backend = normalizeProjectDataBackend(record.backend);
  const baseUrl = typeof record.baseUrl === 'string' && record.baseUrl.trim()
    ? record.baseUrl.trim()
    : DEFAULT_PROJECT_DATA_SETTINGS.baseUrl;
  const embeddingModel = typeof record.embeddingModel === 'string' && record.embeddingModel.trim()
    ? record.embeddingModel.trim()
    : DEFAULT_PROJECT_DATA_SETTINGS.embeddingModel;
  const topK = typeof record.topK === 'number' && Number.isInteger(record.topK) && record.topK > 0
    ? record.topK
    : DEFAULT_PROJECT_DATA_SETTINGS.topK;
  return { enabled, backend, baseUrl, embeddingModel, topK };
}

export function projectDataEmbeddingsChanged(current: ProjectDataSettings, next: ProjectDataSettings): boolean {
  return current.backend !== next.backend
    || current.baseUrl !== next.baseUrl
    || current.embeddingModel !== next.embeddingModel;
}

export function projectDataStatusLabel(settings: ProjectDataSettings): string {
  return settings.enabled ? 'Configured' : 'Disabled';
}
