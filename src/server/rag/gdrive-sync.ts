import { ingestDocument, listDocuments, deleteDocument } from './service.js';
import { exportFileContent, listDriveFilesRecursive } from './gdrive-client.js';
import { GDRIVE_FOLDER_MIME } from './gdrive-mimes.js';

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '';

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
    if (file.mimeType === GDRIVE_FOLDER_MIME) {
      continue;
    }

    const existing = existingByName.get(file.name);
    if (existing) {
      existingByName.delete(file.name);
      const driveModified = new Date(file.modifiedTime).getTime();
      const ragCreated = new Date(existing.created_at).getTime();
      if (driveModified <= ragCreated) {
        skipped++;
        continue;
      }
      console.log(`[gdrive-sync] Re-ingesting "${file.name}" (modified since last sync)`);
      await deleteDocument(existing.id);
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
