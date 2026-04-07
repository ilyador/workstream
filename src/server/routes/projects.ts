import { Router } from 'express';
import { projectCoreRouter } from './project-core.js';
import { projectMembersRouter } from './project-members.js';

export const projectsRouter = Router();

projectsRouter.use(projectCoreRouter);
projectsRouter.use(projectMembersRouter);
