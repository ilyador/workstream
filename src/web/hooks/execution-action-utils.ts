import type { ExecutionActionContext } from './execution-action-types';

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export async function requireExecutionContext({
  projectId,
  localPath,
  modal,
}: ExecutionActionContext) {
  if (!projectId || !localPath) {
    await modal.alert('Missing path', 'Set a local folder path for this project first.');
    return null;
  }

  return { projectId, localPath };
}
