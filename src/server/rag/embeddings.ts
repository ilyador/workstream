const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-nomic-embed-text-v1.5';

interface EmbeddingData { index: number; embedding: number[]; }
interface EmbeddingResponse { data: EmbeddingData[]; }

export async function embed(input: string | string[]): Promise<number[][]> {
  const response = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Embedding API error (${response.status})`);
  const data: EmbeddingResponse = await response.json();
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}
