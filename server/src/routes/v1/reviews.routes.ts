import { Router } from 'express';

import {
  consumePromptHandler,
  createReviewPromptsHandler,
  fetchUserReviewsHandler,
  getUserAverageRatingHandler,
  listReviewPromptsHandler,
  submitReviewHandler
} from '../../controllers/reviews.controller';
import { authenticate } from '../../middleware/auth';

const reviewsRouter = Router();

reviewsRouter.post('/prompts', authenticate, createReviewPromptsHandler);
reviewsRouter.get('/prompts', authenticate, listReviewPromptsHandler);
reviewsRouter.patch('/prompts/:promptId/consume', authenticate, consumePromptHandler);
reviewsRouter.post('/:requestId', authenticate, submitReviewHandler);
reviewsRouter.get('/user/:userId', authenticate, fetchUserReviewsHandler);
reviewsRouter.get('/user/:userId/average', authenticate, getUserAverageRatingHandler);

export { reviewsRouter };

