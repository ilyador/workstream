// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProjectDataRoute } from './ProjectDataRoute';
import { ModalContext, type ModalContextValue } from '../hooks/modal-context';
import type { ProjectDataSettings } from '../lib/api';

const api = vi.hoisted(() => ({
  createProjectTextDocument: vi.fn(),
  deleteProjectDocument: vi.fn(),
  getProjectDocuments: vi.fn(),
  searchProjectData: vi.fn(),
  updateProjectDataSettings: vi.fn(),
  uploadProjectDocument: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    ...api,
  };
});

const baseSettings: ProjectDataSettings = {
  enabled: true,
  backend: 'lmstudio',
  baseUrl: 'http://localhost:1234/v1',
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5',
  topK: 5,
};

const modalValue: ModalContextValue = {
  alert: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(true),
};

function renderRoute(settings: ProjectDataSettings, overrides?: { role?: string; reload?: () => Promise<ProjectDataSettings | undefined> }) {
  return render(
    <ModalContext.Provider value={modalValue}>
      <ProjectDataRoute
        project={{ id: 'project-1', role: overrides?.role || 'admin' }}
        projectDataSettings={settings}
        reloadProjectDataSettings={overrides?.reload || vi.fn().mockResolvedValue(settings)}
      />
    </ModalContext.Provider>,
  );
}

describe('ProjectDataRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getProjectDocuments.mockResolvedValue([]);
    api.updateProjectDataSettings.mockResolvedValue(baseSettings);
  });

  it('disables document indexing and search until Project Data is enabled', async () => {
    renderRoute({ ...baseSettings, enabled: false });

    await waitFor(() => {
      expect(api.getProjectDocuments).toHaveBeenCalledWith('project-1');
    });

    expect((screen.getByRole('button', { name: 'Upload File' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Index Text Note' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Enable Project Data in project settings before uploading, indexing, or searching documents.')).toBeTruthy();
  });

  it('confirms and requests reindex when embedding settings change with indexed documents', async () => {
    const user = userEvent.setup();
    const nextSettings = { ...baseSettings, embeddingModel: 'text-embedding-3-small' };
    const reload = vi.fn()
      .mockResolvedValueOnce(baseSettings)
      .mockResolvedValue(nextSettings);

    api.getProjectDocuments.mockResolvedValue([
      {
        id: 'doc-1',
        file_name: 'spec.md',
        file_type: 'md',
        file_size: 100,
        chunk_count: 4,
        status: 'ready',
        error: null,
        created_at: '2026-04-09T10:00:00.000Z',
      },
    ]);
    api.updateProjectDataSettings.mockResolvedValue({
      ...nextSettings,
      reindex: { total: 1, ready: 1, failed: 0 },
    });

    renderRoute(baseSettings, { reload });

    await waitFor(() => {
      expect(screen.getByDisplayValue('text-embedding-nomic-embed-text-v1.5')).toBeTruthy();
    });

    await user.clear(screen.getByLabelText('Embedding Model'));
    await user.type(screen.getByLabelText('Embedding Model'), 'text-embedding-3-small');
    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(modalValue.confirm).toHaveBeenCalledWith(
        'Reindex Project Data',
        'Changing the embedding backend, base URL, or embedding model requires reindexing all existing Project Data documents.',
        { label: 'Save and Reindex' },
      );
    });

    expect(api.updateProjectDataSettings).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ embeddingModel: 'text-embedding-3-small' }),
      { reindex: true },
    );
    await waitFor(() => {
      expect(screen.getByText('Reindexed 1 of 1 documents.')).toBeTruthy();
    });
  });
});
