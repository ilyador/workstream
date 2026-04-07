import { Router } from 'express';
import { artifactCreateRouter } from './artifact-create.js';
import { artifactDeleteRouter } from './artifact-delete.js';
import { artifactDownloadRouter } from './artifact-download.js';
import { artifactListRouter } from './artifact-list.js';
import { artifactUpdateRouter } from './artifact-update.js';

export const artifactsRouter = Router();

artifactsRouter.use(artifactCreateRouter);
artifactsRouter.use(artifactListRouter);
artifactsRouter.use(artifactDownloadRouter);
artifactsRouter.use(artifactDeleteRouter);
artifactsRouter.use(artifactUpdateRouter);
