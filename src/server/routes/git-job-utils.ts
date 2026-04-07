import { asRecord, type DbRecord } from '../authz.js';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Git operation failed';
}

export function nestedRecord(record: DbRecord, key: string): DbRecord | null {
  return asRecord(record[key]);
}

export function phaseOutputBody(phases: unknown): string {
  if (!Array.isArray(phases)) return '';
  let body = '### Phase Outputs\n\n';
  for (const phase of phases) {
    const record = asRecord(phase);
    if (!record) continue;
    const output = typeof record.output === 'string' ? record.output : JSON.stringify(record.output, null, 2);
    body += `**${String(record.phase || 'phase')}** (attempt ${String(record.attempt || 1)})\n\`\`\`\n${output.substring(0, 2000)}\n\`\`\`\n\n`;
  }
  return body;
}
