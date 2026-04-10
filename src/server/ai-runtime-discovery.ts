import { execFileSync } from 'child_process';
import {
  AI_RUNTIME_DEFINITIONS,
  type AiRuntimeId,
  type AiRuntimeStatus,
} from '../shared/ai-runtimes.js';
import { claudeEnv } from './claude-env.js';

let detectedAt: string | null = null;
let cachedRuntimes: AiRuntimeStatus[] = AI_RUNTIME_DEFINITIONS.map(runtime => ({
  ...runtime,
  available: false,
  detectedPath: null,
}));

function resolveCommandPath(command: string): string | null {
  try {
    const output = execFileSync('which', [command], {
      encoding: 'utf8',
      env: claudeEnv,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function detectRuntimeStatuses(): AiRuntimeStatus[] {
  return AI_RUNTIME_DEFINITIONS.map(runtime => {
    const detectedPath = resolveCommandPath(runtime.command);
    return {
      ...runtime,
      available: Boolean(detectedPath),
      detectedPath,
    };
  });
}

export function refreshDetectedAiRuntimes(): AiRuntimeStatus[] {
  cachedRuntimes = detectRuntimeStatuses();
  detectedAt = new Date().toISOString();
  return cachedRuntimes;
}

export function getDetectedAiRuntimes(): AiRuntimeStatus[] {
  if (!detectedAt) return refreshDetectedAiRuntimes();
  return cachedRuntimes;
}

export function getDetectedAiRuntime(runtimeId: string | null | undefined): AiRuntimeStatus | null {
  if (!runtimeId) return null;
  return getDetectedAiRuntimes().find(runtime => runtime.id === runtimeId) ?? null;
}

export function requireDetectedAiRuntime(runtimeId: AiRuntimeId | string): AiRuntimeStatus {
  const runtime = getDetectedAiRuntime(runtimeId);
  if (!runtime) {
    throw new Error(`Unknown runtime: ${runtimeId}`);
  }
  if (!runtime.available) {
    throw new Error(`Runtime not available on this server: ${runtime.label}`);
  }
  return runtime;
}

export function getDetectedAiRuntimeTimestamp(): string | null {
  return detectedAt;
}
