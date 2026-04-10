import type { ProjectDataSettings } from '../../shared/project-data.js';

interface EmbeddingData { index: number; embedding: number[]; }
interface EmbeddingResponse { data: EmbeddingData[]; }

function normalizeEmbeddingBaseUrl(baseUrl: string): string {
  return /\/v1\/?$/.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : `${baseUrl.replace(/\/+$/, '')}/v1`;
}

export async function embed(input: string | string[], settings: ProjectDataSettings): Promise<number[][]> {
  const response = await fetch(`${normalizeEmbeddingBaseUrl(settings.baseUrl)}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.embeddingModel, input }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Embedding API error (${response.status})`);
  const data: EmbeddingResponse = await response.json();
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}
