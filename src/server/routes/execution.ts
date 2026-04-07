import { Router } from 'express';
import { jobLifecycleRouter } from './job-lifecycle.js';
import { runRouter } from './run.js';

export const executionRouter = Router();

executionRouter.use(runRouter);
executionRouter.use(jobLifecycleRouter);
