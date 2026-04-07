const PREVIEWABLE = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/json',
  'application/pdf',
];

export function isPreviewable(mime: string): boolean {
  return PREVIEWABLE.some(prefix => mime.startsWith(prefix));
}

export function isMdFile(mime: string, filename: string): boolean {
  return mime === 'text/markdown' || filename.endsWith('.md');
}
