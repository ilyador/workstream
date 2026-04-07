import { driveClient } from './gdrive-auth.js';
import { GDRIVE_FOLDER_MIME, SUPPORTED_MIMES } from './gdrive-mimes.js';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export { exportFileContent } from './gdrive-export.js';

export async function listDriveFilesRecursive(folderId: string, prefix = ''): Promise<DriveFile[]> {
  const drive = driveClient();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: 100,
      pageToken,
    });
    for (const file of res.data.files || []) {
      const { id, name, mimeType, modifiedTime } = file;
      if (!id || !name || !mimeType) continue;
      const displayName = prefix ? `${prefix}/${name}` : name;
      if (mimeType === GDRIVE_FOLDER_MIME) {
        files.push(...await listDriveFilesRecursive(id, displayName));
      } else if (modifiedTime && SUPPORTED_MIMES.has(mimeType)) {
        files.push({ id, name: displayName, mimeType, modifiedTime });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}
