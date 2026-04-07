import { Router } from 'express';
import { requireAuth } from './auth-middleware.js';
import { requireProjectMember } from './authz.js';
import { addChangeListener } from './realtime-listeners.js';

export const changesRouter = Router();

changesRouter.get('/api/changes', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).end();
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  // Flush an initial comment so proxies (e.g. Vite dev server) forward the
  // response immediately rather than buffering until the first real event.
  res.write(':ok\n\n');

  let cleanedUp = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let removeListener: (() => void) | null = null;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (heartbeat) clearInterval(heartbeat);
    removeListener?.();
  };
  const write = (chunk: string) => {
    if (cleanedUp) return;
    try {
      res.write(chunk);
    } catch {
      cleanup();
    }
  };
  const send = (data: unknown) => {
    write(`data: ${JSON.stringify(data)}\n\n`);
  };

  removeListener = addChangeListener(projectId, send);
  heartbeat = setInterval(() => write(':heartbeat\n\n'), 15000);

  req.on('close', cleanup);
});
