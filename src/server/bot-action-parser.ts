import type { BotAction } from './bot-action-types.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseActions(response: string): { text: string; actions: BotAction[] } {
  const lines = response.split('\n');
  const actions: BotAction[] = [];
  const textLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^ACTION:\s+(\w+)\s+(.+)$/);
    if (!match) {
      textLines.push(line);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[2]);
    } catch {
      console.warn(`[bot] Dropped ACTION line with invalid JSON for action: ${match[1]}`);
      textLines.push(line);
      continue;
    }
    if (!isPlainObject(parsed)) {
      console.warn(`[bot] Dropped ACTION line because params are not a JSON object for action: ${match[1]}`);
      textLines.push(line);
      continue;
    }
    actions.push({ name: match[1], params: parsed });
  }

  return { text: textLines.join('\n').trim(), actions };
}
