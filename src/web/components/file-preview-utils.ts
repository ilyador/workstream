const MEDIA_PREVIEWABLE = [
  'image/',
  'video/',
  'audio/',
];

const PREVIEWABLE = [
  ...MEDIA_PREVIEWABLE,
  'text/',
  'application/json',
  'application/pdf',
];

export function isPreviewable(mime: string, filename = ''): boolean {
  return isMdFile(mime, filename) || PREVIEWABLE.some(prefix => mime.startsWith(prefix));
}

export function isMdFile(mime: string, filename: string): boolean {
  return mime === 'text/markdown' || filename.endsWith('.md');
}

export function isMediaFile(mime: string): boolean {
  return MEDIA_PREVIEWABLE.some(prefix => mime.startsWith(prefix));
}
