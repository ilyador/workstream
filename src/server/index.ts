import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { corsMiddleware } from './cors.js';
import { artifactsRouter } from './routes/artifacts.js';
import { commentsRouter } from './routes/comments.js';
import { dashboardRouter } from './routes/dashboard.js';
import { executionRouter } from './routes/execution.js';
import { gitRouter } from './routes/git.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { flowsRouter } from './routes/flows.js';
import { jobEventsRouter } from './routes/job-events.js';
import { onboardingRouter } from './routes/onboarding.js';
import { projectsRouter } from './routes/projects.js';
import { jobsRouter } from './routes/jobs.js';
import { notificationsRouter } from './routes/notifications.js';
import { skillsRouter } from './routes/skills.js';
import { tasksRouter } from './routes/tasks.js';
import { workstreamsRouter } from './routes/workstreams.js';
import { changesRouter } from './realtime.js';
import { aiRuntimesRouter } from './routes/ai-runtimes.js';
import { refreshDetectedAiRuntimes } from './ai-runtime-discovery.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(corsMiddleware);

app.use(express.json({ limit: '1mb' }));

// Onboarding
app.use(onboardingRouter);

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Auth (signup, signin, signout, me, refresh)
app.use(authRouter);

// Runtime catalog
app.use(aiRuntimesRouter);

// Data (projects, tasks, workstreams, jobs, comments, notifications, SSE changes)
app.use(projectsRouter);
app.use(flowsRouter);
app.use(workstreamsRouter);
app.use(tasksRouter);
app.use(jobsRouter);
app.use(commentsRouter);
app.use(artifactsRouter);
app.use(notificationsRouter);
app.use(dashboardRouter);
app.use(skillsRouter);
app.use(changesRouter);

// Execution engine (run, reply, approve, reject, SSE job events)
app.use(jobEventsRouter);
app.use(executionRouter);

// Git operations (commit, push, pr)
app.use(gitRouter);

// Documents (upload, search, list, delete)
app.use(documentsRouter);

function errorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 500;
  const record = error as Record<string, unknown>;
  const status = typeof record.status === 'number' ? record.status : record.statusCode;
  return typeof status === 'number' ? status : 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal server error';
}

// Global error handler
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  void next;
  console.error('Unhandled error:', err);
  const status = errorStatus(err);
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : errorMessage(err),
  });
});

void refreshDetectedAiRuntimes().then(detectedRuntimes => {
  app.listen(PORT, () => {
    console.log(`WorkStream server running on port ${PORT}`);
    const summary = detectedRuntimes
      .filter(runtime => runtime.available)
      .map(runtime => `${runtime.label} (${runtime.command})`)
      .join(', ');
    console.log(`[runtimes] Detected: ${summary || 'none'}`);
  });
});
