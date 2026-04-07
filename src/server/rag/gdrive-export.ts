import { driveClient } from './gdrive-auth.js';
import {
  DOCX_MIME,
  GDRIVE_DOCUMENT_MIME,
  GDRIVE_PRESENTATION_MIME,
  GDRIVE_SPREADSHEET_MIME,
  PDF_MIME,
  textDownloadFileType,
} from './gdrive-mimes.js';

export interface ExportedDriveFile {
  content: string | Buffer;
  fileType: string;
}

export async function exportFileContent(fileId: string, mimeType: string): Promise<ExportedDriveFile> {
  const drive = driveClient();

  if (mimeType === GDRIVE_DOCUMENT_MIME) {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
    return { content: res.data as string, fileType: 'txt' };
  }

  if (mimeType === GDRIVE_SPREADSHEET_MIME) {
    const res = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'text' });
    return { content: res.data as string, fileType: 'csv' };
  }

  if (mimeType === GDRIVE_PRESENTATION_MIME) {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
    return { content: res.data as string, fileType: 'txt' };
  }

  if (mimeType === PDF_MIME) {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { content: Buffer.from(res.data as ArrayBuffer), fileType: 'pdf' };
  }

  if (mimeType === DOCX_MIME) {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { content: Buffer.from(res.data as ArrayBuffer), fileType: 'docx' };
  }

  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return { content: res.data as string, fileType: textDownloadFileType(mimeType) };
}
