import { Router } from 'express';

import {
  acceptRequestHandler,
  createRequestHandler,
  listOpenRequestsHandler,
  listParticipatingRequestsHandler,
  listUserHistoryHandler,
  markRequestDoneHandler,
  deleteOpenRequestHandler
} from '../../controllers/requests.controller';
import { authenticate, optionalAuthenticate } from '../../middleware/auth';

const requestsRouter = Router();

requestsRouter.get('/open', optionalAuthenticate, listOpenRequestsHandler);
requestsRouter.get('/participating', authenticate, listParticipatingRequestsHandler);
requestsRouter.get('/history', authenticate, listUserHistoryHandler);
requestsRouter.post('/', authenticate, createRequestHandler);
requestsRouter.post('/:requestId/accept', authenticate, acceptRequestHandler);
requestsRouter.post('/:requestId/complete', authenticate, markRequestDoneHandler);
requestsRouter.delete('/:requestId', authenticate, deleteOpenRequestHandler);

export { requestsRouter };

