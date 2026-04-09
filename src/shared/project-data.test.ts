import { describe, expect, it } from 'vitest';
import { projectDataEmbeddingsChanged, type ProjectDataSettings } from './project-data';

const base: ProjectDataSettings = {
  enabled: true,
  backend: 'lmstudio',
  baseUrl: 'http://localhost:1234/v1',
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5',
  topK: 5,
};

describe('projectDataEmbeddingsChanged', () => {
  it('ignores non-embedding settings', () => {
    expect(projectDataEmbeddingsChanged(base, { ...base, enabled: false, topK: 10 })).toBe(false);
  });

  it('detects embedding-affecting config changes', () => {
    expect(projectDataEmbeddingsChanged(base, { ...base, embeddingModel: 'text-embedding-3-small' })).toBe(true);
    expect(projectDataEmbeddingsChanged(base, { ...base, baseUrl: 'http://localhost:11434/v1' })).toBe(true);
    expect(projectDataEmbeddingsChanged(base, { ...base, backend: 'ollama' })).toBe(true);
  });
});
