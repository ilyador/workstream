import path from 'path';

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function safeDocumentName(input: string): string | null {
  const basename = path.basename(input).trim();
  const name = Array.from(basename)
    .map(char => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 || '"\\/:*?<>|'.includes(char) ? '_' : char;
    })
    .join('')
    .slice(0, 180);
  return name.length > 0 && name !== '.' && name !== '..' ? name : null;
}

export function documentType(name: string): 'pdf' | 'docx' | 'csv' | 'md' | 'txt' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf' || ext === 'docx' || ext === 'csv' || ext === 'md') return ext;
  return 'txt';
}

export function searchLimit(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 1), 20);
}
