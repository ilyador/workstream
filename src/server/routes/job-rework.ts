import { Router } from 'express';
import { jobBacklogRouter } from './job-backlog.js';
import { jobRevertRouter } from './job-revert.js';
import { jobReworkStartRouter } from './job-rework-start.js';

export const jobReworkRouter = Router();

jobReworkRouter.use(jobReworkStartRouter);
jobReworkRouter.use(jobBacklogRouter);
jobReworkRouter.use(jobRevertRouter);
