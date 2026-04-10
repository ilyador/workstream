import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getDetectedAiRuntimesSync, getDetectedAiRuntimeTimestamp } from '../ai-runtime-discovery.js';

export const aiRuntimesRouter = Router();

aiRuntimesRouter.get('/api/ai-runtimes', requireAuth, (_req, res) => {
  res.json({
    detected_at: getDetectedAiRuntimeTimestamp(),
    runtimes: getDetectedAiRuntimesSync(),
  });
});
