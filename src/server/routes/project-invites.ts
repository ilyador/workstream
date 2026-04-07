import { Router } from 'express';
import { projectInviteCreateRouter } from './project-invite-create.js';
import { projectMemberRemoveRouter } from './project-member-remove.js';

export const projectInvitesRouter = Router();

projectInvitesRouter.use(projectInviteCreateRouter);
projectInvitesRouter.use(projectMemberRemoveRouter);
