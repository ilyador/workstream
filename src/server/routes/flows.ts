import { Router } from 'express';
import { customTypesRouter } from './custom-types.js';
import { flowRoutes } from './flow-routes.js';

export const flowsRouter = Router();

flowsRouter.use(customTypesRouter);
flowsRouter.use(flowRoutes);
