import { Router } from 'express';
import { jobContinueRouter } from './job-continue.js';
import { jobReplyRouter } from './job-reply.js';
import { jobTerminateRouter } from './job-terminate.js';

export const jobControlRouter = Router();

jobControlRouter.use(jobReplyRouter);
jobControlRouter.use(jobContinueRouter);
jobControlRouter.use(jobTerminateRouter);
