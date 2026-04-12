import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_DATA_SETTINGS,
  normalizeProjectDataBackend,
  normalizeProjectDataSettings,
  projectDataEmbeddingsChanged,
  projectDataStatusLabel,
  PROJECT_DATA_BACKENDS,
  type ProjectDataSettings,
} from './project-data';

const base: ProjectDataSettings = {
  enabled: true,
  backend: 'lmstudio',
  baseUrl: 'http://localhost:1234/v1',
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5',
  topK: 5,
};

describe('normalizeProjectDataBackend', () => {
  it('returns a valid backend id unchanged', () => {
    for (const b of PROJECT_DATA_BACKENDS) {
      expect(normalizeProjectDataBackend(b.id)).toBe(b.id);
    }
  });

  it('falls back to default for unknown strings, null, undefined, numbers', () => {
    for (const value of ['unknown', '', null, undefined, 42]) {
      expect(normalizeProjectDataBackend(value)).toBe(DEFAULT_PROJECT_DATA_SETTINGS.backend);
    }
  });
});

describe('normalizeProjectDataSettings', () => {
  it('returns defaults for null / undefined / non-object input', () => {
    for (const value of [null, undefined, 'string', 42, true]) {
      expect(normalizeProjectDataSettings(value)).toEqual(DEFAULT_PROJECT_DATA_SETTINGS);
    }
  });

  it('returns defaults for an empty object', () => {
    expect(normalizeProjectDataSettings({})).toEqual(DEFAULT_PROJECT_DATA_SETTINGS);
  });

  it('preserves valid fields and applies defaults for missing ones', () => {
    const result = normalizeProjectDataSettings({
      enabled: true,
      backend: 'ollama',
      baseUrl: 'http://ollama:11434/v1',
    });
    expect(result.enabled).toBe(true);
    expect(result.backend).toBe('ollama');
    expect(result.baseUrl).toBe('http://ollama:11434/v1');
    expect(result.embeddingModel).toBe(DEFAULT_PROJECT_DATA_SETTINGS.embeddingModel);
    expect(result.topK).toBe(DEFAULT_PROJECT_DATA_SETTINGS.topK);
  });

  it('rejects non-integer and non-positive topK values', () => {
    expect(normalizeProjectDataSettings({ topK: 0 }).topK).toBe(DEFAULT_PROJECT_DATA_SETTINGS.topK);
    expect(normalizeProjectDataSettings({ topK: -1 }).topK).toBe(DEFAULT_PROJECT_DATA_SETTINGS.topK);
    expect(normalizeProjectDataSettings({ topK: 3.5 }).topK).toBe(DEFAULT_PROJECT_DATA_SETTINGS.topK);
    expect(normalizeProjectDataSettings({ topK: 'ten' }).topK).toBe(DEFAULT_PROJECT_DATA_SETTINGS.topK);
  });

  it('accepts valid positive integer topK', () => {
    expect(normalizeProjectDataSettings({ topK: 10 }).topK).toBe(10);
  });

  it('trims whitespace from baseUrl and embeddingModel', () => {
    const result = normalizeProjectDataSettings({ baseUrl: '  http://host  ', embeddingModel: '  model  ' });
    expect(result.baseUrl).toBe('http://host');
    expect(result.embeddingModel).toBe('model');
  });

  it('falls back when baseUrl or embeddingModel is whitespace-only', () => {
    const result = normalizeProjectDataSettings({ baseUrl: '   ', embeddingModel: '   ' });
    expect(result.baseUrl).toBe(DEFAULT_PROJECT_DATA_SETTINGS.baseUrl);
    expect(result.embeddingModel).toBe(DEFAULT_PROJECT_DATA_SETTINGS.embeddingModel);
  });
});

describe('projectDataStatusLabel', () => {
  it('returns Configured when enabled', () => {
    expect(projectDataStatusLabel({ ...base, enabled: true })).toBe('Configured');
  });

  it('returns Disabled when not enabled', () => {
    expect(projectDataStatusLabel({ ...base, enabled: false })).toBe('Disabled');
  });
});

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
