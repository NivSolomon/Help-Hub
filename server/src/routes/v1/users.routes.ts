import { Router } from 'express';

import {
  ensureUserDocHandler,
  getMeHandler,
  getUserHandler,
  onboardingProfileHandler,
  updateProfileHandler
} from '../../controllers/users.controller';
import { authenticate } from '../../middleware/auth';

const usersRouter = Router();

usersRouter.post('/ensure', authenticate, ensureUserDocHandler);
usersRouter.get('/me', authenticate, getMeHandler);
usersRouter.patch('/me', authenticate, updateProfileHandler);
usersRouter.post('/me/onboarding', authenticate, onboardingProfileHandler);
usersRouter.get('/:userId', authenticate, getUserHandler);

export { usersRouter };

