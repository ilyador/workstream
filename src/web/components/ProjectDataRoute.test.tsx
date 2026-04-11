// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProjectDataRoute } from './ProjectDataRoute';
import { ModalContext, type ModalContextValue } from '../hooks/modal-context';
import type { ProjectDataSettings } from '../lib/api';

const api = vi.hoisted(() => ({
  getProjectDocuments: vi.fn(),
  searchProjectData: vi.fn(),
  updateProjectDataSettings: vi.fn(),
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

function renderRoute(
  settings: ProjectDataSettings,
  overrides?: { role?: string; projectId?: string; reload?: () => Promise<ProjectDataSettings | undefined> },
) {
  return render(
    <ModalContext.Provider value={modalValue}>
      <ProjectDataRoute
        project={{ id: overrides?.projectId || 'project-1', role: overrides?.role || 'admin' }}
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
    api.searchProjectData.mockResolvedValue([]);
    api.updateProjectDataSettings.mockResolvedValue(baseSettings);
  });

  it('disables search until Project Data is enabled', async () => {
    renderRoute({ ...baseSettings, enabled: false });

    await waitFor(() => {
      expect(api.getProjectDocuments).toHaveBeenCalledWith('project-1');
    });

    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Disabled')).toBeTruthy();
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

  it('shows the Enabled badge and admin hint when Project Data is enabled', async () => {
    renderRoute(baseSettings);

    await waitFor(() => {
      expect(api.getProjectDocuments).toHaveBeenCalledWith('project-1');
    });

    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Tune embeddings, index material, and test retrieval from one place.')).toBeTruthy();
  });

  it('clears project-scoped search state when the project changes', async () => {
    const user = userEvent.setup();
    api.searchProjectData.mockResolvedValue([
      {
        content: 'Old project result',
        file_name: 'spec.md',
        document_id: 'doc-1',
        chunk_index: 0,
        similarity: 0.91,
      },
    ]);

    const view = renderRoute(baseSettings);

    await waitFor(() => {
      expect(api.getProjectDocuments).toHaveBeenCalledWith('project-1');
    });

    await user.type(screen.getByPlaceholderText('Search the indexed project knowledge…'), 'lore');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Old project result')).toBeTruthy();
    });

    view.rerender(
      <ModalContext.Provider value={modalValue}>
        <ProjectDataRoute
          project={{ id: 'project-2', role: 'admin' }}
          projectDataSettings={baseSettings}
          reloadProjectDataSettings={vi.fn().mockResolvedValue(baseSettings)}
        />
      </ModalContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Old project result')).toBeNull();
    });
    expect((screen.getByPlaceholderText('Search the indexed project knowledge…') as HTMLInputElement).value).toBe('');
  });
});
