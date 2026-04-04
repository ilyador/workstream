/** Get emoji icon for a MIME type */
export function getFileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🔊';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gz')) return '📦';
  return '📄';
}

/** Format file size in human-readable form */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
