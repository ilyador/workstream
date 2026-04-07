import { Router } from 'express';
import { commentCountsRouter } from './comment-counts.js';
import { commentCreateRouter } from './comment-create.js';
import { commentDeleteRouter } from './comment-delete.js';
import { commentListRouter } from './comment-list.js';

export const commentsRouter = Router();

commentsRouter.use(commentCountsRouter);
commentsRouter.use(commentListRouter);
commentsRouter.use(commentCreateRouter);
commentsRouter.use(commentDeleteRouter);
