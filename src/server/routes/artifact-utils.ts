import type { Response } from 'express';
import path from 'path';
import { isMissingRowError, stringField, type DbRecord } from '../authz.js';

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

export function requireStringField(res: Response, record: DbRecord, key: string, label: string): string | null {
  const value = stringField(record, key);
  if (!value) {
    res.status(404).json({ error: `${label} not found` });
    return null;
  }
  return value;
}

export function safeArtifactFilename(input: string): string | null {
  const basename = path.basename(input).trim();
  const filename = Array.from(basename)
    .map(char => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 || '"\\/:*?<>|'.includes(char) ? '_' : char;
    })
    .join('')
    .slice(0, 180);
  return filename.length > 0 && filename !== '.' && filename !== '..' ? filename : null;
}

export function normalizeRepoPath(value: unknown): { path: string | null; error?: string } {
  if (value == null || value === '') return { path: null };
  if (typeof value !== 'string') return { path: null, error: 'repo_path must be a string' };
  const repoPath = value.trim();
  if (!repoPath) return { path: null };
  if (repoPath.length > 500) return { path: null, error: 'repo_path is too long' };
  if (repoPath.includes('\0')) return { path: null, error: 'repo_path cannot contain null bytes' };
  if (path.isAbsolute(repoPath) || repoPath.split(/[\\/]+/).includes('..')) {
    return { path: null, error: 'repo_path must be a relative path inside the repository' };
  }
  return { path: repoPath };
}

export function normalizeMimeType(value: string): string | null {
  const mimeType = value.trim();
  if (!mimeType || mimeType.length > 255 || /[\r\n]/.test(mimeType)) return null;
  return mimeType;
}

export function decodeBase64Artifact(value: string): { buffer?: Buffer; error?: string } {
  const base64 = value.trim();
  if (!base64) return { error: 'data must be non-empty base64' };
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return { error: 'data must be valid base64' };
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_ARTIFACT_BYTES) return { error: 'artifact exceeds maximum size' };
  if (buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) {
    return { error: 'data must be valid base64' };
  }
  return { buffer };
}

export function readArtifactError(error: { code?: string; message: string }, res: Response): void {
  if (isMissingRowError(error)) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  res.status(400).json({ error: error.message });
}
