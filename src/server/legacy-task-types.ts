import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_TASK_TYPES } from './legacy-default-task-types.js';
import type { TaskTypeConfig } from './legacy-task-type-types.js';

export type { TaskTypeConfig } from './legacy-task-type-types.js';

function isTaskTypeConfig(value: unknown): value is TaskTypeConfig {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.phases)
    && record.phases.every(phase => typeof phase === 'string')
    && record.phases.length > 0
    && typeof record.verify_retries === 'number';
}

export function loadTaskTypeConfig(localPath: string, taskType: string): TaskTypeConfig {
  const configPath = join(localPath, '.codesync', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const taskTypes = config.task_types && typeof config.task_types === 'object'
        ? config.task_types as Record<string, unknown>
        : {};
      const custom = taskTypes[taskType];
      if (isTaskTypeConfig(custom)) return custom;
    } catch {
      // Fall through to defaults for malformed legacy config.
    }
  }
  return DEFAULT_TASK_TYPES[taskType] || DEFAULT_TASK_TYPES.feature;
}
