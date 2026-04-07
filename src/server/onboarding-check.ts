import { execFileSync } from 'child_process';

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  help: string;
  required: boolean;
}

export function run(cmd: string, args: string[] = []): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, { timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { ok: true, output };
  } catch {
    return { ok: false, output: '' };
  }
}
