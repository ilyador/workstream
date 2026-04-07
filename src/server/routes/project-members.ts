import { Router } from 'express';
import { projectInvitesRouter } from './project-invites.js';
import { projectMemberListRouter } from './project-member-list.js';

export const projectMembersRouter = Router();

projectMembersRouter.use(projectMemberListRouter);
projectMembersRouter.use(projectInvitesRouter);
