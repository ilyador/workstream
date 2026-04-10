export function slugifyCustomTypeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function validateCustomTypeInput(input: { description: unknown }): string | null {
  if (input.description !== undefined && typeof input.description !== 'string') return 'description must be a string';
  return null;
}
