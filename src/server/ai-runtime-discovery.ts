import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  AI_RUNTIME_DEFINITIONS,
  type AiRuntimeId,
  type AiRuntimeStatus,
} from '../shared/ai-runtimes.js';
import { buildRuntimeEnv } from './runtimes/env.js';

const execFileAsync = promisify(execFile);

let detectedAt: string | null = null;
let cachedRuntimes: AiRuntimeStatus[] = AI_RUNTIME_DEFINITIONS.map(runtime => ({
  ...runtime,
  available: false,
  detectedPath: null,
}));

async function resolveCommandPath(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [command], {
      env: buildRuntimeEnv('claude_code'),
      timeout: 5_000,
    });
    const trimmed = typeof stdout === 'string' ? stdout.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

async function detectRuntimeStatuses(): Promise<AiRuntimeStatus[]> {
  const results = await Promise.all(
    AI_RUNTIME_DEFINITIONS.map(async runtime => {
      const detectedPath = await resolveCommandPath(runtime.command);
      return {
        ...runtime,
        available: Boolean(detectedPath),
        detectedPath,
      };
    }),
  );
  return results;
}

export async function refreshDetectedAiRuntimes(): Promise<AiRuntimeStatus[]> {
  cachedRuntimes = await detectRuntimeStatuses();
  detectedAt = new Date().toISOString();
  return cachedRuntimes;
}

export async function getDetectedAiRuntimes(): Promise<AiRuntimeStatus[]> {
  if (!detectedAt) return refreshDetectedAiRuntimes();
  return cachedRuntimes;
}

export function getDetectedAiRuntimesSync(): AiRuntimeStatus[] {
  return cachedRuntimes;
}

export function getDetectedAiRuntime(runtimeId: string | null | undefined): AiRuntimeStatus | null {
  if (!runtimeId) return null;
  return cachedRuntimes.find(runtime => runtime.id === runtimeId) ?? null;
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
