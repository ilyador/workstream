import type { Check } from './onboarding-check.js';

type ModelListResponse = {
  data?: Array<{ id?: string }>;
};

export async function appendLmStudioChecks(checks: Check[]): Promise<void> {
  const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://localhost:1234';
  let lmStudioOk = false;
  let modelsBody: ModelListResponse | null = null;
  try {
    const resp = await fetch(`${lmStudioUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
    lmStudioOk = resp.ok;
    if (resp.ok) modelsBody = await resp.json() as ModelListResponse;
  } catch {
    lmStudioOk = false;
  }
  checks.push({
    id: 'lm-studio',
    label: 'LM Studio',
    ok: lmStudioOk,
    help: 'Start LM Studio server: lms server start — needed for AI doc search (RAG)',
    required: false,
  });

  if (lmStudioOk && modelsBody) {
    const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-nomic-embed-text-v1.5';
    const modelLoaded = modelsBody.data?.some(model => model.id?.includes('nomic') || model.id?.includes('embed')) ?? false;
    checks.push({
      id: 'embedding-model',
      label: 'Embedding model loaded',
      ok: modelLoaded,
      help: `Load embedding model: lms load ${embeddingModel}`,
      required: false,
    });
  }
}
