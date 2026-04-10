import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import {
  registerActiveProcess,
  unregisterActiveProcess,
  isJobCanceled,
} from '../process-lifecycle.js';

export const DEFAULT_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunProcessOptions {
  jobId: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  /**
   * Called for each non-empty line emitted on stdout or stderr. Empty lines
   * are filtered; drivers that need a faithful byte-for-byte view of the
   * output should read the full `stdout` / `stderr` from the resolved
   * `RunProcessResult`. The `stream` argument identifies which source the
   * line came from.
   */
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  onLog: (text: string) => void;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runProcess(opts: RunProcessOptions): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;

    const proc: ChildProcess = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    registerActiveProcess(opts.jobId, proc);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stdoutLineBuffer = '';
    let stderrLineBuffer = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      opts.onLog(`[runner] Process ${opts.command} timed out after ${timeoutMs / 60000}m — killing\n`);
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }, timeoutMs);

    const flushLines = (buffer: string, stream: 'stdout' | 'stderr'): string => {
      const lines = buffer.split(/\r?\n/);
      const remainder = lines.pop() ?? '';
      for (const line of lines) {
        if (line) opts.onLine(line, stream);
      }
      return remainder;
    };

    if (proc.stdin) {
      proc.stdin.on('error', (err: Error) => {
        opts.onLog(`[runner] stdin error for ${opts.command} (job ${opts.jobId}): ${err.message}\n`);
      });
      if (opts.stdin !== undefined) {
        proc.stdin.write(opts.stdin);
        proc.stdin.end();
      }
    }

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdoutBuffer += text;
      stdoutLineBuffer = flushLines(stdoutLineBuffer + text, 'stdout');
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      stderrLineBuffer = flushLines(stderrLineBuffer + text, 'stderr');
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stdoutLineBuffer) opts.onLine(stdoutLineBuffer, 'stdout');
      if (stderrLineBuffer) opts.onLine(stderrLineBuffer, 'stderr');
      unregisterActiveProcess(opts.jobId, proc);

      if (isJobCanceled(opts.jobId)) {
        reject(new Error('Job canceled'));
        return;
      }
      if (timedOut) {
        reject(new Error(`${opts.command} timed out after ${timeoutMs / 60000}m`));
        return;
      }
      const exitCode = code ?? 0;
      if (exitCode === 0) {
        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer, exitCode });
        return;
      }
      const stderrTail = stderrBuffer.trim().split('\n').slice(-10).join('\n');
      const detail = stderrTail ? `\n${stderrTail}` : '';
      reject(new Error(`${opts.command} exited with code ${exitCode}${detail}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      unregisterActiveProcess(opts.jobId, proc);
      reject(err);
    });
  });
}
