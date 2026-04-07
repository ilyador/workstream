import { Router } from 'express';
import { authSessionRouter } from './auth-session.js';
import { authSignupRouter } from './auth-signup.js';

export const authRouter = Router();

authRouter.use(authSignupRouter);
authRouter.use(authSessionRouter);
