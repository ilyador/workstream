import { Router, type Response } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireAnyExactRegisteredLocalPath } from '../authz.js';
import { runChecks } from '../onboarding.js';

export const onboardingRouter = Router();

onboardingRouter.get('/api/onboarding', async (req, res, next) => {
  const requestedLocalPath = typeof req.query.localPath === 'string' ? req.query.localPath.trim() : '';
  if (requestedLocalPath) {
    next();
    return;
  }
  await sendOnboarding(res);
});

onboardingRouter.get('/api/onboarding', requireAuth, async (req, res) => {
  const requestedLocalPath = typeof req.query.localPath === 'string' ? req.query.localPath.trim() : '';
  if (!requestedLocalPath) {
    await sendOnboarding(res);
    return;
  }

  const localPath = await requireAnyExactRegisteredLocalPath(req, res, requestedLocalPath);
  if (!localPath) return;
  await sendOnboarding(res, localPath);
});

async function sendOnboarding(res: Response, localPath?: string): Promise<void> {
  const checks = await runChecks(localPath);
  const allRequiredOk = checks.filter(c => c.required).every(c => c.ok);
  res.json({ checks, ready: allRequiredOk });
}
