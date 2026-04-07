import { Router } from 'express';
import { taskCreateRouter } from './task-create.js';
import { taskDetailsRouter } from './task-details.js';
import { taskListRouter } from './task-list.js';
import { taskMutationsRouter } from './task-mutations.js';

export const tasksRouter = Router();

tasksRouter.use(taskListRouter);
tasksRouter.use(taskCreateRouter);
tasksRouter.use(taskMutationsRouter);
tasksRouter.use(taskDetailsRouter);
