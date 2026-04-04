import { google } from 'googleapis';
import { ingestDocument, listDocuments, deleteDocument } from './service.js';

const CREDENTIALS_PATH = process.env.GDRIVE_CREDENTIALS_PATH || './endstream-data-fa9d7e0fa618.json';
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '';

function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  });
  return auth;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

const SUPPORTED_MIMES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

async function listDriveFilesRecursive(folderId: string, prefix = ''): Promise<DriveFile[]> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: 100,
      pageToken,
    });
    for (const f of res.data.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await listDriveFilesRecursive(f.id!, prefix ? `${prefix}/${f.name}` : f.name!);
        files.push(...subFiles);
      } else if (SUPPORTED_MIMES.has(f.mimeType!)) {
        const name = prefix ? `${prefix}/${f.name}` : f.name!;
        files.push({ id: f.id!, name, mimeType: f.mimeType!, modifiedTime: f.modifiedTime! });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

async function exportFileContent(fileId: string, mimeType: string): Promise<{ content: string | Buffer; fileType: string }> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
    return { content: res.data as string, fileType: 'txt' };
  }

  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'text' });
    return { content: res.data as string, fileType: 'csv' };
  }

  if (mimeType === 'application/vnd.google-apps.presentation') {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
    return { content: res.data as string, fileType: 'txt' };
  }

  if (mimeType === 'application/pdf') {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { content: Buffer.from(res.data as ArrayBuffer), fileType: 'pdf' };
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { content: Buffer.from(res.data as ArrayBuffer), fileType: 'docx' };
  }

  // Plain text, markdown, csv, etc.
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  const ext = mimeType.includes('csv') ? 'csv' : mimeType.includes('markdown') ? 'md' : 'txt';
  return { content: res.data as string, fileType: ext };
}

export async function syncDriveFolder(projectId: string, folderId?: string): Promise<{ added: number; skipped: number; removed: number }> {
  const folder = folderId || FOLDER_ID;
  if (!folder) throw new Error('No GDRIVE_FOLDER_ID configured');

  console.log(`[gdrive-sync] Listing files in folder ${folder} (recursive)...`);
  const driveFiles = await listDriveFilesRecursive(folder);
  console.log(`[gdrive-sync] Found ${driveFiles.length} files in Drive`);

  // Get existing docs in RAG
  const existingDocs = await listDocuments(projectId);
  const existingByName = new Map(existingDocs.map(d => [d.file_name, d]));

  let added = 0;
  let skipped = 0;

  for (const file of driveFiles) {
    // Skip folders
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      continue;
    }

    if (existingByName.has(file.name)) {
      console.log(`[gdrive-sync] Skipping "${file.name}" (already ingested)`);
      existingByName.delete(file.name);
      skipped++;
      continue;
    }

    console.log(`[gdrive-sync] Ingesting "${file.name}" (${file.mimeType})...`);
    try {
      const { content, fileType } = await exportFileContent(file.id, file.mimeType);
      const result = await ingestDocument(projectId, file.name, fileType, content);
      console.log(`[gdrive-sync]   → ${result.status}, ${result.chunkCount} chunks`);
      added++;
    } catch (err) {
      console.error(`[gdrive-sync]   → Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Remove docs that are no longer in Drive
  let removed = 0;
  for (const [name, doc] of existingByName) {
    console.log(`[gdrive-sync] Removing "${name}" (no longer in Drive)`);
    await deleteDocument(doc.id);
    removed++;
  }

  console.log(`[gdrive-sync] Done: ${added} added, ${skipped} skipped, ${removed} removed`);
  return { added, skipped, removed };
}
