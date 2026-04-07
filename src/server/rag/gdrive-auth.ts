import { google } from 'googleapis';

const CREDENTIALS_PATH = process.env.GDRIVE_CREDENTIALS_PATH || '';

let googleAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (!CREDENTIALS_PATH) throw new Error('GDRIVE_CREDENTIALS_PATH not set in .env');
  googleAuth ??= new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  });
  return googleAuth;
}

export function driveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}
