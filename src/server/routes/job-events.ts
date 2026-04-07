import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireJobAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { errorMessage, lastEventId, numericField } from './job-event-utils.js';

export const jobEventsRouter = Router();

// EventSource passes auth via query token, which requireAuth accepts.
jobEventsRouter.get('/api/jobs/:id/events', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId, 'id, project_id, log_offset');
  if (!access) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(':ok\n\n');

  let lastId = lastEventId(req.headers['last-event-id']) || numericField(access.record, 'log_offset') || 0;
  let closed = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = (end = false) => {
    if (closed) return;
    closed = true;
    if (pollInterval) clearInterval(pollInterval);
    if (heartbeat) clearInterval(heartbeat);
    if (end) res.end();
  };
  const write = (chunk: string): boolean => {
    if (closed) return false;
    try {
      res.write(chunk);
      return true;
    } catch (error) {
      console.warn(`[execution] SSE write error for job ${jobId}:`, errorMessage(error, 'write failed'));
      cleanup();
      return false;
    }
  };

  if (!write('retry: 3000\n\n')) return;
  if (!write(`event: connected\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`)) return;

  pollInterval = setInterval(async () => {
    if (closed) return;
    try {
      const { data: logs, error: logsError } = await supabase
        .from('job_logs')
        .select('id, event, data')
        .eq('job_id', jobId)
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(100);
      if (logsError) {
        console.warn(`[execution] SSE poll error for job ${jobId}:`, logsError.message);
        return;
      }

      if (closed || !logs || logs.length === 0) return;

      for (const log of logs) {
        if (closed) break;
        if (!write(`id: ${log.id}\nevent: ${log.event}\ndata: ${JSON.stringify(log.data)}\n\n`)) return;
        lastId = log.id;

        if (log.event === 'done' || log.event === 'failed') {
          cleanup(true);
          return;
        }
      }
    } catch (error) {
      console.warn(`[execution] SSE poll error for job ${jobId}:`, errorMessage(error, 'poll failed'));
    }
  }, 500);

  heartbeat = setInterval(() => {
    write(':heartbeat\n\n');
  }, 15000);

  req.on('close', () => cleanup());
});
