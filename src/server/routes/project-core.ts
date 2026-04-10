import { Router } from 'express';
import { projectCreateRouter } from './project-create.js';
import { projectDataSettingsRouter } from './project-data-settings.js';
import { projectListRouter } from './project-list.js';
import { projectLocalPathRouter } from './project-local-path.js';

export const projectCoreRouter = Router();

projectCoreRouter.use(projectListRouter);
projectCoreRouter.use(projectCreateRouter);
projectCoreRouter.use(projectLocalPathRouter);
projectCoreRouter.use(projectDataSettingsRouter);
