import type { ChildProcess } from 'child_process';

const activeProcesses = new Map<string, Set<ChildProcess>>();
const canceledJobs = new Set<string>();

export function registerActiveProcess(jobId: string, proc: ChildProcess): void {
  const processes = activeProcesses.get(jobId) ?? new Set<ChildProcess>();
  processes.add(proc);
  activeProcesses.set(jobId, processes);
}

export function unregisterActiveProcess(jobId: string, proc: ChildProcess): void {
  const processes = activeProcesses.get(jobId);
  if (!processes) return;
  processes.delete(proc);
  if (processes.size === 0) activeProcesses.delete(jobId);
}

export function getActiveProcessCount(jobId: string): number {
  return activeProcesses.get(jobId)?.size ?? 0;
}

export function isJobCanceled(jobId: string): boolean {
  return canceledJobs.has(jobId);
}

export function markJobCanceled(jobId: string): void {
  canceledJobs.add(jobId);
}

export function clearJobCancellation(jobId: string): void {
  canceledJobs.delete(jobId);
}

function terminateProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let closed = false;
    let escalate: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (closed) return;
      closed = true;
      if (escalate) clearTimeout(escalate);
      if (fallback) clearTimeout(fallback);
      resolve();
    };

    proc.once('close', finish);
    try { proc.kill('SIGTERM'); } catch { finish(); return; }
    escalate = setTimeout(() => {
      if (!closed) {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }
    }, 5000);
    fallback = setTimeout(finish, 6000);
  });
}

export async function cancelJob(jobId: string): Promise<void> {
  const processes = activeProcesses.get(jobId);
  if (!processes || processes.size === 0) return;
  markJobCanceled(jobId);
  await Promise.all([...processes].map(terminateProcess));
  activeProcesses.delete(jobId);
  clearJobCancellation(jobId);
}

export async function cancelAllJobs(): Promise<void> {
  const entries = Array.from(activeProcesses.entries());
  activeProcesses.clear();
  const terminations: Promise<void>[] = [];
  for (const [jobId, processes] of entries) {
    markJobCanceled(jobId);
    for (const proc of processes) {
      terminations.push(terminateProcess(proc).catch(() => {}));
    }
  }
  await Promise.all(terminations);
  for (const [jobId] of entries) clearJobCancellation(jobId);
}
