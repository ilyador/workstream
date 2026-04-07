import { Router } from 'express';
import { flowListRouter } from './flow-list.js';
import { flowMutationsRouter } from './flow-mutations.js';
import { flowStepRoutes } from './flow-step-routes.js';

export const flowRoutes = Router();

flowRoutes.use(flowListRouter);
flowRoutes.use(flowMutationsRouter);
flowRoutes.use(flowStepRoutes);
