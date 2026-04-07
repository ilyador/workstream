export function runBody(value: Record<string, unknown>): { taskId: string; projectId: string; localPath: string } | { error: string } {
  const { taskId, projectId, localPath } = value;
  if (typeof taskId !== 'string' || typeof projectId !== 'string' || typeof localPath !== 'string') {
    return { error: 'taskId, projectId, and localPath are required' };
  }
  return { taskId, projectId, localPath };
}
