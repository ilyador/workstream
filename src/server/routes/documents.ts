import { Router } from 'express';
import { documentDeleteRouter } from './document-delete.js';
import { documentListRouter } from './document-list.js';
import { documentSearchRouter } from './document-search.js';
import { documentTextRouter } from './document-text.js';
import { documentUploadRouter } from './document-upload-route.js';

export const documentsRouter = Router();

documentsRouter.use(documentListRouter);
documentsRouter.use(documentUploadRouter);
documentsRouter.use(documentTextRouter);
documentsRouter.use(documentSearchRouter);
documentsRouter.use(documentDeleteRouter);
