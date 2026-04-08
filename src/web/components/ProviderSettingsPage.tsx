import { useEffect, useMemo, useState } from 'react';
import {
  isProviderUpdateEmbeddingResponse,
  type EmbeddingProviderUpdateResponse,
  type ProviderConfig,
  type ProviderUpdateResponse,
} from '../lib/api';
import { useModal } from '../hooks/modal-context';
import s from './ProviderSettingsPage.module.css';

interface ProviderDraft {
  label: string;
  base_url: string;
  is_enabled: boolean;
  supports_embeddings: boolean;
  embedding_model: string;
  api_key: string;
}

interface ProviderSettingsPageProps {
  providers: ProviderConfig[];
  embeddingProviderConfigId: string | null;
  embeddingDimensions: number | null;
  detectedLocalProviders: Array<{ provider: ProviderConfig['provider']; label: string; base_url: string }>;
  onLoadDiagnostics?: () => Promise<unknown>;
  onCreateProvider: (data: {
    provider: ProviderConfig['provider'];
    label?: string;
    base_url?: string;
    api_key?: string;
    is_enabled?: boolean;
    supports_embeddings?: boolean;
    embedding_model?: string;
  }) => Promise<void>;
  onUpdateProvider: (providerId: string, data: Record<string, unknown>, opts?: { reindexDocuments?: boolean }) => Promise<ProviderUpdateResponse>;
  onDeleteProvider: (providerId: string) => Promise<void>;
  onTestProvider: (providerId: string) => Promise<{ ok: boolean; status: 'online' | 'offline'; message: string; models: string[]; embedding_dimensions?: number | null }>;
  onRefreshProviderModels: (providerId: string) => Promise<string[]>;
  onUpdateEmbeddingProvider: (embeddingProviderConfigId: string | null, opts?: { reindexDocuments?: boolean }) => Promise<EmbeddingProviderUpdateResponse>;
  onReindexDocuments: () => Promise<{ reindexed: number }>;
}

function toDraft(provider: ProviderConfig): ProviderDraft {
  return {
    label: provider.label,
    base_url: provider.base_url || '',
    is_enabled: provider.is_enabled,
    supports_embeddings: provider.supports_embeddings,
    embedding_model: provider.embedding_model || '',
    api_key: '',
  };
}

export function ProviderSettingsPage({
  providers,
  embeddingProviderConfigId,
  embeddingDimensions,
  detectedLocalProviders,
  onLoadDiagnostics,
  onCreateProvider,
  onUpdateProvider,
  onDeleteProvider,
  onTestProvider,
  onRefreshProviderModels,
  onUpdateEmbeddingProvider,
  onReindexDocuments,
}: ProviderSettingsPageProps) {
  const modal = useModal();
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [selectedEmbeddingId, setSelectedEmbeddingId] = useState<string | null>(embeddingProviderConfigId);
  const [newProvider, setNewProvider] = useState({
    provider: 'custom' as ProviderConfig['provider'],
    label: '',
    base_url: '',
    api_key: '',
    supports_embeddings: false,
    embedding_model: '',
  });

  useEffect(() => {
    setDrafts(Object.fromEntries(providers.map(provider => [provider.id, toDraft(provider)])));
  }, [providers]);

  useEffect(() => {
    setSelectedEmbeddingId(embeddingProviderConfigId);
  }, [embeddingProviderConfigId]);

  useEffect(() => {
    if (!onLoadDiagnostics) return;
    void onLoadDiagnostics().catch(() => {});
  }, [onLoadDiagnostics]);

  const embeddingProviders = useMemo(
    () => providers.filter(provider => provider.supports_embeddings && provider.is_enabled),
    [providers],
  );

  function actionErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'The action failed.';
  }

  async function runWithErrorAlert(title: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      await modal.alert(title, actionErrorMessage(error));
    }
  }

  async function saveProvider(provider: ProviderConfig) {
    const draft = drafts[provider.id];
    if (!draft) return;
    const updates: Record<string, unknown> = {
      label: draft.label.trim(),
      base_url: draft.base_url.trim() || null,
      is_enabled: draft.is_enabled,
      supports_embeddings: draft.supports_embeddings,
      embedding_model: draft.embedding_model.trim() || null,
    };
    if (draft.api_key.trim()) updates.api_key = draft.api_key.trim();
    let result = await onUpdateProvider(provider.id, updates);
    if (isProviderUpdateEmbeddingResponse(result) && result.requires_reindex && !result.updated) {
      const confirmed = await modal.confirm(
        'Re-index Required',
        `Saving ${provider.label} would change project embeddings from ${result.embedding_dimensions} to ${result.detected_embedding_dimensions} dimensions. Re-index documents now to finish the update?`,
        { label: 'Re-index', danger: true },
      );
      if (!confirmed) return;
      result = await onUpdateProvider(provider.id, updates, { reindexDocuments: true });
    }
    setDrafts(current => ({
      ...current,
      [provider.id]: { ...current[provider.id], api_key: '' },
    }));
    if (isProviderUpdateEmbeddingResponse(result) && result.reindexed !== null) {
      await modal.alert(
        'Provider Updated',
        `Saved ${provider.label} and re-indexed ${result.reindexed} documents.`,
      );
    }
  }

  async function handleDelete(provider: ProviderConfig) {
    const confirmed = await modal.confirm(
      'Delete Provider',
      `Delete ${provider.label}? Existing flow steps using ${provider.provider} will need to be updated.`,
      { label: 'Delete', danger: true },
    );
    if (!confirmed) return;
    await onDeleteProvider(provider.id);
  }

  async function handleTest(provider: ProviderConfig) {
    const result = await onTestProvider(provider.id);
    await modal.alert(
      `${provider.label}: ${result.status}`,
      `${result.message}${result.models.length > 0 ? `\n\nModels:\n${result.models.join('\n')}` : ''}`,
    );
  }

  async function handleRefreshModels(provider: ProviderConfig) {
    const models = await onRefreshProviderModels(provider.id);
    await modal.alert(provider.label, models.length > 0 ? `Discovered ${models.length} models.` : 'No models were returned by the provider.');
  }

  async function handleSaveEmbeddingProvider() {
    const result = await onUpdateEmbeddingProvider(selectedEmbeddingId);
    if (result.requires_reindex && !result.updated) {
      const confirmed = await modal.confirm(
        'Re-index Required',
        `The selected embedding provider returns ${result.detected_embedding_dimensions} dimensions, while this project currently stores ${result.embedding_dimensions}. Re-index documents now to complete the switch?`,
        { label: 'Re-index', danger: true },
      );
      if (!confirmed) return;
      const reindexedResult = await onUpdateEmbeddingProvider(selectedEmbeddingId, { reindexDocuments: true });
      await modal.alert(
        'Embedding Provider Updated',
        `Saved the embedding provider and re-indexed ${reindexedResult.reindexed ?? 0} documents.`,
      );
      return;
    }
    if (result.reindexed !== null) {
      await modal.alert('Embedding Provider Updated', `Saved the embedding provider and re-indexed ${result.reindexed} documents.`);
    }
  }

  async function handleReindexDocuments() {
    const confirmed = await modal.confirm(
      'Re-index Documents',
      'Delete and rebuild all stored document embeddings for this project?',
      { label: 'Re-index', danger: true },
    );
    if (!confirmed) return;
    const result = await onReindexDocuments();
    await modal.alert('Re-index Complete', `Re-indexed ${result.reindexed} documents.`);
  }

  async function handleCreateProvider() {
    await onCreateProvider({
      provider: newProvider.provider,
      label: newProvider.label.trim() || undefined,
      base_url: newProvider.base_url.trim() || undefined,
      api_key: newProvider.api_key.trim() || undefined,
      supports_embeddings: newProvider.supports_embeddings,
      embedding_model: newProvider.embedding_model.trim() || undefined,
    });
    setNewProvider({
      provider: 'custom',
      label: '',
      base_url: '',
      api_key: '',
      supports_embeddings: false,
      embedding_model: '',
    });
  }

  return (
    <div className={s.page}>
      <div className={s.section}>
        <div className={s.heading}>Providers</div>
        <p className={s.muted}>Configure Claude, Codex, and local or custom OpenAI-compatible endpoints for flow execution and embeddings.</p>
      </div>

      <div className={s.section}>
        <div className={s.subheading}>Embedding Provider</div>
        <div className={s.row}>
          <label className={s.field}>
            <span className={s.label}>Provider</span>
            <select className={s.select} value={selectedEmbeddingId || ''} onChange={event => setSelectedEmbeddingId(event.target.value || null)}>
              <option value="">Use fallback / none</option>
              {embeddingProviders.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span className={s.label}>Stored Dimensions</span>
            <input className={s.input} value={embeddingDimensions ?? ''} readOnly placeholder="Not indexed yet" />
          </label>
        </div>
        <div className={s.actions}>
          <button className="btn btnPrimary" type="button" onClick={() => void runWithErrorAlert('Update Embedding Provider Failed', handleSaveEmbeddingProvider)}>
            Save Embedding Provider
          </button>
          <button className="btn btnSecondary" type="button" onClick={() => void runWithErrorAlert('Re-index Failed', handleReindexDocuments)}>
            Re-index Documents
          </button>
        </div>
      </div>

      {detectedLocalProviders.length > 0 && (
        <div className={s.section}>
          <div className={s.subheading}>Detected Local Providers</div>
          <div className={s.stack}>
            {detectedLocalProviders.map(candidate => (
              <div key={candidate.provider} className={s.card}>
                <div className={s.cardHeader}>
                  <div>
                    <div className={s.cardTitle}>{candidate.label}</div>
                    <div className={s.models}>{candidate.base_url}</div>
                  </div>
                  <button
                    className="btn btnSecondary btnSm"
                    type="button"
                    onClick={() => void runWithErrorAlert('Add Provider Failed', async () => {
                      await onCreateProvider({
                        provider: candidate.provider,
                        label: candidate.label,
                        base_url: candidate.base_url,
                      });
                    })}
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={s.section}>
        <div className={s.subheading}>Add Provider</div>
        <div className={s.row}>
          <label className={s.field}>
            <span className={s.label}>Type</span>
            <select className={s.select} value={newProvider.provider} onChange={event => setNewProvider(current => ({ ...current, provider: event.target.value as ProviderConfig['provider'] }))}>
              <option value="lmstudio">LM Studio</option>
              <option value="ollama">Ollama</option>
              <option value="custom">Custom OpenAI-Compatible</option>
            </select>
          </label>
          <label className={s.field}>
            <span className={s.label}>Label</span>
            <input className={s.input} value={newProvider.label} onChange={event => setNewProvider(current => ({ ...current, label: event.target.value }))} placeholder="Optional display name" />
          </label>
          <label className={s.field}>
            <span className={s.label}>Base URL</span>
            <input className={s.input} value={newProvider.base_url} onChange={event => setNewProvider(current => ({ ...current, base_url: event.target.value }))} placeholder="http://localhost:1234" />
          </label>
        </div>
        <div className={s.row}>
          <label className={s.field}>
            <span className={s.label}>API Key</span>
            <input className={s.input} value={newProvider.api_key} onChange={event => setNewProvider(current => ({ ...current, api_key: event.target.value }))} placeholder="Optional" />
          </label>
          <label className={s.field}>
            <span className={s.label}>Embedding Model</span>
            <input className={s.input} value={newProvider.embedding_model} onChange={event => setNewProvider(current => ({ ...current, embedding_model: event.target.value }))} placeholder="text-embedding-..." />
          </label>
          <label className={s.checkboxRow}>
            <input type="checkbox" checked={newProvider.supports_embeddings} onChange={event => setNewProvider(current => ({ ...current, supports_embeddings: event.target.checked }))} />
            <span>Supports embeddings</span>
          </label>
        </div>
        <div className={s.actions}>
          <button className="btn btnPrimary" type="button" onClick={() => void runWithErrorAlert('Add Provider Failed', handleCreateProvider)}>
            Add Provider
          </button>
        </div>
      </div>

      <div className={s.section}>
        <div className={s.subheading}>Configured Providers</div>
        <div className={s.stack}>
          {providers.map(provider => {
            const draft = drafts[provider.id] || toDraft(provider);
            return (
              <div key={provider.id} className={s.card}>
                <div className={s.cardHeader}>
                  <div>
                    <div className={s.cardTitle}>{provider.label}</div>
                    <div className={s.models}>{provider.provider}</div>
                  </div>
                  <span className={`${s.status} ${provider.status === 'online' ? s.statusOnline : s.statusOffline}`}>
                    {provider.status}
                  </span>
                </div>
                <div className={s.muted}>{provider.status_message}</div>
                <div className={s.row}>
                  <label className={s.field}>
                    <span className={s.label}>Label</span>
                    <input className={s.input} value={draft.label} onChange={event => setDrafts(current => ({ ...current, [provider.id]: { ...draft, label: event.target.value } }))} />
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Base URL</span>
                    <input className={s.input} value={draft.base_url} onChange={event => setDrafts(current => ({ ...current, [provider.id]: { ...draft, base_url: event.target.value } }))} placeholder={provider.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434'} />
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Embedding Model</span>
                    <input className={s.input} value={draft.embedding_model} onChange={event => setDrafts(current => ({ ...current, [provider.id]: { ...draft, embedding_model: event.target.value } }))} placeholder="Optional" />
                  </label>
                </div>
                <div className={s.row}>
                  <label className={s.field}>
                    <span className={s.label}>API Key</span>
                    <input className={s.input} value={draft.api_key} onChange={event => setDrafts(current => ({ ...current, [provider.id]: { ...draft, api_key: event.target.value } }))} placeholder={provider.has_api_key ? 'Saved. Enter new key to replace it.' : 'Optional'} />
                  </label>
                  <label className={s.checkboxRow}>
                    <input type="checkbox" checked={draft.is_enabled} onChange={event => setDrafts(current => ({ ...current, [provider.id]: { ...draft, is_enabled: event.target.checked } }))} />
                    <span>Enabled</span>
                  </label>
                  <label className={s.checkboxRow}>
                    <input type="checkbox" checked={draft.supports_embeddings} onChange={event => setDrafts(current => ({ ...current, [provider.id]: { ...draft, supports_embeddings: event.target.checked } }))} />
                    <span>Supports embeddings</span>
                  </label>
                </div>
                <div className={s.models}>
                  {provider.models.length > 0 ? `Models: ${provider.models.join(', ')}` : 'No models discovered yet.'}
                </div>
                <div className={s.actions}>
                  <button className="btn btnPrimary btnSm" type="button" onClick={() => void runWithErrorAlert('Save Provider Failed', async () => saveProvider(provider))}>
                    Save
                  </button>
                  <button className="btn btnSecondary btnSm" type="button" onClick={() => void runWithErrorAlert('Provider Test Failed', async () => handleTest(provider))}>
                    Test
                  </button>
                  <button className="btn btnSecondary btnSm" type="button" onClick={() => void runWithErrorAlert('Model Refresh Failed', async () => handleRefreshModels(provider))}>
                    Refresh Models
                  </button>
                  {(provider.provider !== 'claude' && provider.provider !== 'codex') && (
                    <button className="btn btnDanger btnSm" type="button" onClick={() => void runWithErrorAlert('Delete Provider Failed', async () => handleDelete(provider))}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
