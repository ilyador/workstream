import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, single };
});

vi.mock('./supabase.js', () => ({
  supabase: {
    from: supabaseMock.from,
  },
}));

import { resolveTaskProjectDataAllowed } from './project-data-settings.js';

describe('resolveTaskProjectDataAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips loading project settings when Project Data was not requested', async () => {
    await expect(resolveTaskProjectDataAllowed('project-1', false)).resolves.toBe(false);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('returns false when the project has Project Data disabled', async () => {
    supabaseMock.single.mockResolvedValueOnce({
      data: {
        project_data_enabled: false,
        project_data_backend: 'lmstudio',
        project_data_base_url: 'http://localhost:1234/v1',
        project_data_embedding_model: 'text-embedding-nomic-embed-text-v1.5',
        project_data_top_k: 5,
      },
      error: null,
    });

    await expect(resolveTaskProjectDataAllowed('project-1', true)).resolves.toBe(false);
  });

  it('returns true when the project has Project Data enabled', async () => {
    supabaseMock.single.mockResolvedValueOnce({
      data: {
        project_data_enabled: true,
        project_data_backend: 'lmstudio',
        project_data_base_url: 'http://localhost:1234/v1',
        project_data_embedding_model: 'text-embedding-nomic-embed-text-v1.5',
        project_data_top_k: 5,
      },
      error: null,
    });

    await expect(resolveTaskProjectDataAllowed('project-1', true)).resolves.toBe(true);
  });
});
