import { Router } from 'express';
import { flowCreateRouter } from './flow-create.js';
import { flowDeleteRouter } from './flow-delete.js';
import { flowUpdateRouter } from './flow-update.js';

export const flowMutationsRouter = Router();

flowMutationsRouter.use(flowCreateRouter);
flowMutationsRouter.use(flowUpdateRouter);
flowMutationsRouter.use(flowDeleteRouter);
