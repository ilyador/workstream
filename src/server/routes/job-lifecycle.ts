import { Router } from 'express';
import { jobApprovalRouter } from './job-approval.js';
import { jobControlRouter } from './job-control.js';
import { jobReworkRouter } from './job-rework.js';

export const jobLifecycleRouter = Router();

jobLifecycleRouter.use(jobControlRouter);
jobLifecycleRouter.use(jobApprovalRouter);
jobLifecycleRouter.use(jobReworkRouter);
