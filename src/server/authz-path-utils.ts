import { realpathSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

export function expandHomePath(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return path.join(homedir(), input.slice(2));
  return input;
}

export function existingRealPath(input: string): string {
  const expanded = expandHomePath(input.trim());
  try {
    return realpathSync.native(expanded);
  } catch {
    return path.resolve(expanded);
  }
}

export function pathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function configuredProjectRoots(): string[] {
  return (process.env.WORKSTREAM_ALLOWED_PROJECT_ROOTS || '')
    .split(',')
    .map(root => root.trim())
    .filter(Boolean)
    .map(existingRealPath);
}
