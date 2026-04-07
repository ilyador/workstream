import { Router } from 'express';
import { workstreamCreateRouter } from './workstream-create.js';
import { workstreamDeleteRouter } from './workstream-delete.js';
import { workstreamListRouter } from './workstream-list.js';
import { workstreamUpdateRouter } from './workstream-update.js';

export const workstreamsRouter = Router();

workstreamsRouter.use(workstreamListRouter);
workstreamsRouter.use(workstreamCreateRouter);
workstreamsRouter.use(workstreamUpdateRouter);
workstreamsRouter.use(workstreamDeleteRouter);
