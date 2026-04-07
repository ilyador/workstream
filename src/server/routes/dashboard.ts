import { Router } from 'express';
import { dashboardFocusRouter } from './dashboard-focus.js';
import { dashboardSummaryRouter } from './dashboard-summary.js';

export const dashboardRouter = Router();

dashboardRouter.use(dashboardFocusRouter);
dashboardRouter.use(dashboardSummaryRouter);
