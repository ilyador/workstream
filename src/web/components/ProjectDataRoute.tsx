import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProjectTextDocument,
  deleteProjectDocument,
  getProjectDocuments,
  searchProjectData,
  updateProjectDataSettings,
  uploadProjectDocument,
  type ProjectDataReindexResult,
  type ProjectDataSearchResult,
  type ProjectDataSettings,
  type ProjectDocumentRecord,
} from '../lib/api';
import { projectDataEmbeddingsChanged } from '../../shared/project-data.js';
import { useModal } from '../hooks/modal-context';
import s from './ProjectDataRoute.module.css';

interface ProjectDataRouteProps {
  project: {
    id: string;
    role: string;
  };
  projectDataSettings: ProjectDataSettings;
  reloadProjectDataSettings: () => Promise<ProjectDataSettings | undefined>;
}

function formatReindexMessage(summary: ProjectDataReindexResult | null | undefined): string {
  if (!summary) return 'Project Data settings saved.';
  const base = `Reindexed ${summary.ready} of ${summary.total} documents`;
  if (summary.failed > 0 && summary.error) return `${base}; ${summary.failed} failed. ${summary.error}`;
  if (summary.failed > 0) return `${base}; ${summary.failed} failed.`;
  return `${base}.`;
}

export function ProjectDataRoute({ project, projectDataSettings, reloadProjectDataSettings }: ProjectDataRouteProps) {
  const modal = useModal();
  const [settings, setSettings] = useState<ProjectDataSettings>(projectDataSettings);
  const [savedSettings, setSavedSettings] = useState<ProjectDataSettings>(projectDataSettings);
  const [documents, setDocuments] = useState<ProjectDocumentRecord[]>([]);
  const [results, setResults] = useState<ProjectDataSearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = project.role === 'admin';
  const projectDataEnabled = settings.enabled;

  useEffect(() => {
    setSettings(projectDataSettings);
    setSavedSettings(projectDataSettings);
    setDocuments([]);
    setResults([]);
    setSearchQuery('');
    setDraftName('');
    setDraftContent('');
    setLoading(true);
    setSaving(false);
    setError('');
    setMessage('');
  }, [project.id, projectDataSettings]);

  const loadAll = useCallback(async ({ reloadSettings = false }: { reloadSettings?: boolean } = {}) => {
    setLoading(true);
    setError('');
    try {
      const [nextSettings, nextDocuments] = await Promise.all([
        reloadSettings ? reloadProjectDataSettings() : Promise.resolve(undefined),
        getProjectDocuments(project.id),
      ]);
      if (nextSettings) {
        setSettings(nextSettings);
        setSavedSettings(nextSettings);
      }
      setDocuments(nextDocuments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Project Data');
    } finally {
      setLoading(false);
    }
  }, [project.id, reloadProjectDataSettings]);

  useEffect(() => {
    void loadAll({ reloadSettings: true });
  }, [loadAll]);

  async function saveSettings(options: { reindex?: boolean } = {}) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await updateProjectDataSettings(project.id, settings, { reindex: options.reindex });
      const { reindex, ...nextSettings } = response;
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      try {
        await reloadProjectDataSettings();
        await loadAll();
      } catch (reloadErr) {
        setError(reloadErr instanceof Error ? reloadErr.message : 'Project Data settings were saved, but reloading failed');
      }
      const nextMessage = options.reindex ? formatReindexMessage(reindex ?? null) : 'Project Data settings saved.';
      if (reindex && reindex.failed > 0) {
        setError(nextMessage);
      } else {
        setMessage(nextMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Project Data settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    const needsReindex = documents.length > 0 && projectDataEmbeddingsChanged(savedSettings, settings);
    if (needsReindex) {
      const confirmed = await modal.confirm(
        'Reindex Project Data',
        'Changing the embedding backend, base URL, or embedding model requires reindexing all existing Project Data documents.',
        { label: 'Save and Reindex' },
      );
      if (!confirmed) return;
      await saveSettings({ reindex: true });
      return;
    }
    await saveSettings();
  }

  async function handleReindex() {
    const confirmed = await modal.confirm(
      'Reindex Project Data',
      'Rebuild all indexed Project Data documents with the current embedding settings?',
      { label: 'Reindex' },
    );
    if (!confirmed) return;
    await saveSettings({ reindex: true });
  }

  async function handleUploadFile(file: File) {
    if (!projectDataEnabled) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await uploadProjectDocument(project.id, file);
      setMessage(`Indexed ${file.name}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTextDocument() {
    if (!projectDataEnabled || !draftName.trim() || !draftContent.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await createProjectTextDocument(project.id, draftName.trim(), draftContent);
      setDraftName('');
      setDraftContent('');
      setMessage('Indexed text document.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to index text document');
    } finally {
      setSaving(false);
    }
  }

  async function handleSearch() {
    if (!projectDataEnabled || !searchQuery.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const nextResults = await searchProjectData(project.id, searchQuery.trim(), settings.topK);
      setResults(nextResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Data search failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDocument(documentId: string) {
    const confirmed = await modal.confirm(
      'Delete Project Data document',
      'Remove this indexed document from the project?',
      { label: 'Delete', danger: true },
    );
    if (!confirmed) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await deleteProjectDocument(documentId);
      setMessage('Document removed.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Project Data</h2>
          <p className={s.subtitle}>Project-wide indexed docs for planning, research, and flow steps that request them.</p>
        </div>
      </div>

      {loading ? (
        <div className={s.card}>Loading Project Data…</div>
      ) : (
        <>
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div>
                <h3 className={s.cardTitle}>Settings</h3>
                <p className={s.cardSubtitle}>Configure the embedding backend for this project.</p>
              </div>
            </div>

            <div className={s.grid}>
              <label className={s.field}>
                <span className={s.label}>Backend</span>
                <select
                  className={s.input}
                  value={settings.backend}
                  disabled={!isAdmin}
                  onChange={event => setSettings(current => ({ ...current, backend: event.target.value as ProjectDataSettings['backend'] }))}
                >
                  <option value="lmstudio">LM Studio</option>
                  <option value="ollama">Ollama</option>
                  <option value="openai_compatible">OpenAI-Compatible</option>
                </select>
              </label>

              <label className={s.field}>
                <span className={s.label}>Base URL</span>
                <input
                  className={s.input}
                  value={settings.baseUrl}
                  disabled={!isAdmin}
                  onChange={event => setSettings(current => ({ ...current, baseUrl: event.target.value }))}
                />
              </label>

              <label className={s.field}>
                <span className={s.label}>Embedding Model</span>
                <input
                  className={s.input}
                  value={settings.embeddingModel}
                  disabled={!isAdmin}
                  onChange={event => setSettings(current => ({ ...current, embeddingModel: event.target.value }))}
                />
              </label>

              <label className={s.field}>
                <span className={s.label}>Top K</span>
                <input
                  className={s.input}
                  type="number"
                  min={1}
                  max={50}
                  value={settings.topK}
                  disabled={!isAdmin}
                  onChange={event => setSettings(current => ({ ...current, topK: Number(event.target.value) || 1 }))}
                />
              </label>
            </div>

            <label className={s.checkbox}>
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={!isAdmin}
                onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))}
              />
              <span>Enable Project Data for this project</span>
            </label>

            {isAdmin && (
              <div className={s.actions}>
                <button className="btn btnPrimary" type="button" disabled={saving} onClick={() => void handleSaveSettings()}>
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
                {documents.length > 0 && (
                  <button className="btn btnSecondary" type="button" disabled={saving} onClick={() => void handleReindex()}>
                    {saving ? 'Working…' : 'Reindex Documents'}
                  </button>
                )}
              </div>
            )}
          </section>

          <section className={s.card}>
            <div className={s.cardHeader}>
              <div>
                <h3 className={s.cardTitle}>Documents</h3>
                <p className={s.cardSubtitle}>Upload docs or notes to index them for Project Data retrieval.</p>
              </div>
              {isAdmin && (
                <>
                  <input
                    ref={fileInputRef}
                    className={s.hiddenInput}
                    type="file"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) void handleUploadFile(file);
                      event.currentTarget.value = '';
                    }}
                  />
                  <button className="btn btnSecondary" type="button" disabled={saving || !projectDataEnabled} onClick={() => fileInputRef.current?.click()}>
                    Upload File
                  </button>
                </>
              )}
            </div>

            {!projectDataEnabled && (
              <div className={s.hint}>Enable Project Data in project settings before uploading, indexing, or searching documents.</div>
            )}

            <div className={s.textComposer}>
              <input
                className={s.input}
                placeholder="notes.md"
                value={draftName}
                disabled={!isAdmin || !projectDataEnabled}
                onChange={event => setDraftName(event.target.value)}
              />
              <textarea
                className={s.textarea}
                placeholder="Paste project notes, specs, design rules, or lore here..."
                value={draftContent}
                disabled={!isAdmin || !projectDataEnabled}
                onChange={event => setDraftContent(event.target.value)}
              />
              {isAdmin && (
                <div className={s.actions}>
                  <button className="btn btnSecondary" type="button" disabled={saving || !projectDataEnabled || !draftName.trim() || !draftContent.trim()} onClick={() => void handleCreateTextDocument()}>
                    Index Text Note
                  </button>
                </div>
              )}
            </div>

            <div className={s.list}>
              {documents.length === 0 ? (
                <div className={s.empty}>No indexed documents yet.</div>
              ) : documents.map(document => (
                <div key={document.id} className={s.listRow}>
                  <div>
                    <div className={s.rowTitle}>{document.file_name}</div>
                    <div className={s.rowMeta}>{document.file_type} · {document.chunk_count} chunks · {document.status}</div>
                  </div>
                  {isAdmin && (
                    <button className="btn btnDanger btnSm" type="button" disabled={saving} onClick={() => void handleDeleteDocument(document.id)}>
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className={s.card}>
            <div className={s.cardHeader}>
              <div>
                <h3 className={s.cardTitle}>Search</h3>
                <p className={s.cardSubtitle}>Test what Project Data retrieval will surface for AI steps.</p>
              </div>
            </div>

            <div className={s.searchRow}>
              <input
                className={s.input}
                placeholder="Search the indexed project knowledge…"
                value={searchQuery}
                disabled={!projectDataEnabled}
                onChange={event => setSearchQuery(event.target.value)}
              />
              <button className="btn btnSecondary" type="button" disabled={saving || !projectDataEnabled || !searchQuery.trim()} onClick={() => void handleSearch()}>
                Search
              </button>
            </div>

            <div className={s.results}>
              {results.length === 0 ? (
                <div className={s.empty}>No search results yet.</div>
              ) : results.map((result, index) => (
                <div key={`${result.document_id}-${result.chunk_index}-${index}`} className={s.result}>
                  <div className={s.resultHeader}>
                    <span>{result.file_name}</span>
                    <span>{(result.similarity * 100).toFixed(1)}%</span>
                  </div>
                  <pre className={s.resultBody}>{result.content}</pre>
                </div>
              ))}
            </div>
          </section>

          {(error || message) && (
            <div className={error ? s.error : s.message}>{error || message}</div>
          )}
        </>
      )}
    </div>
  );
}
