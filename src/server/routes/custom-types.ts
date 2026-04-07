import { Router } from 'express';
import { customTypeCreateRouter } from './custom-type-create.js';
import { customTypeDeleteRouter } from './custom-type-delete.js';
import { customTypeListRouter } from './custom-type-list.js';

export const customTypesRouter = Router();

customTypesRouter.use(customTypeListRouter);
customTypesRouter.use(customTypeCreateRouter);
customTypesRouter.use(customTypeDeleteRouter);
