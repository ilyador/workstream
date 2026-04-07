const VALID_PIPELINES = ['feature', 'bug-fix', 'refactor', 'test', 'doc-search'];
const VALID_PIPELINE_SET = new Set(VALID_PIPELINES);

export function slugifyCustomTypeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function validateCustomTypeInput(input: { description: unknown; pipeline: unknown }): string | null {
  if (input.description !== undefined && typeof input.description !== 'string') return 'description must be a string';
  if (input.pipeline !== undefined && (typeof input.pipeline !== 'string' || !VALID_PIPELINE_SET.has(input.pipeline))) {
    return `pipeline must be one of: ${VALID_PIPELINES.join(', ')}`;
  }
  return null;
}
