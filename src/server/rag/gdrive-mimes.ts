export const GDRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export const GDRIVE_DOCUMENT_MIME = 'application/vnd.google-apps.document';
export const GDRIVE_SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const GDRIVE_PRESENTATION_MIME = 'application/vnd.google-apps.presentation';
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const SUPPORTED_MIMES = new Set([
  GDRIVE_DOCUMENT_MIME,
  GDRIVE_SPREADSHEET_MIME,
  GDRIVE_PRESENTATION_MIME,
  PDF_MIME,
  DOCX_MIME,
  'text/plain',
  'text/markdown',
  'text/csv',
]);

export function textDownloadFileType(mimeType: string): string {
  if (mimeType.includes('csv')) return 'csv';
  if (mimeType.includes('markdown')) return 'md';
  return 'txt';
}
