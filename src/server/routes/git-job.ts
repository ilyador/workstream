import { Router } from 'express';
import { gitJobCommitRouter } from './git-job-commit.js';
import { gitJobPrRouter } from './git-job-pr.js';
import { gitJobPushRouter } from './git-job-push.js';

export const gitJobRouter = Router();

gitJobRouter.use(gitJobCommitRouter);
gitJobRouter.use(gitJobPushRouter);
gitJobRouter.use(gitJobPrRouter);
