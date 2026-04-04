import 'dotenv/config';
import { syncDriveFolder } from './rag/gdrive-sync.js';

const projectId = process.argv[2];
const folderId = process.argv[3] || process.env.GDRIVE_FOLDER_ID;

if (!projectId) {
  console.error('Usage: npx tsx src/server/gdrive-sync-cli.ts <projectId> [folderId]');
  process.exit(1);
}

if (!folderId) {
  console.error('No folder ID provided. Pass as second arg or set GDRIVE_FOLDER_ID in .env');
  process.exit(1);
}

syncDriveFolder(projectId, folderId)
  .then(r => {
    console.log(`Sync complete: ${r.added} added, ${r.skipped} unchanged, ${r.removed} removed`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });
