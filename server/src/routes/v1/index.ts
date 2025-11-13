import { Router } from 'express';

import { chatsRouter } from './chats.routes';
import { healthRouter } from './health.routes';
import { requestsRouter } from './requests.routes';
import { reviewsRouter } from './reviews.routes';
import { usersRouter } from './users.routes';
import { supportRouter } from './support.routes';
import { authRouter } from './auth.routes';
import { adminRouter } from './admin.routes';
import { geoRouter } from './geo.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/requests', requestsRouter);
router.use('/reviews', reviewsRouter);
router.use('/users', usersRouter);
router.use('/chats', chatsRouter);
router.use('/support', supportRouter);
router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/geo', geoRouter);

export { router };

