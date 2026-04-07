import { Router } from 'express';
import { gitJobRouter } from './git-job.js';
import { gitWorkstreamRouter } from './git-workstream.js';

export const gitRouter = Router();

gitRouter.use(gitJobRouter);
gitRouter.use(gitWorkstreamRouter);
