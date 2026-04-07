import type { BotAction } from './bot-action-types.js';

export function parseActions(response: string): { text: string; actions: BotAction[] } {
  const lines = response.split('\n');
  const actions: BotAction[] = [];
  const textLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^ACTION:\s+(\w+)\s+(.+)$/);
    if (match) {
      try {
        actions.push({ name: match[1], params: JSON.parse(match[2]) });
      } catch {
        textLines.push(line);
      }
    } else {
      textLines.push(line);
    }
  }

  return { text: textLines.join('\n').trim(), actions };
}
