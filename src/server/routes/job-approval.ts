import { Router } from 'express';
import { jobApproveRouter } from './job-approve.js';
import { jobRejectRouter } from './job-reject.js';

export const jobApprovalRouter = Router();

jobApprovalRouter.use(jobApproveRouter);
jobApprovalRouter.use(jobRejectRouter);
