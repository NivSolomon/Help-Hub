import { Router } from 'express';

import {
  getOrCreateChatHandler,
  listMessagesHandler,
  sendMessageHandler
} from '../../controllers/chats.controller';
import { authenticate } from '../../middleware/auth';

const chatsRouter = Router();

chatsRouter.post('/', authenticate, getOrCreateChatHandler);
chatsRouter.get('/:chatId/messages', authenticate, listMessagesHandler);
chatsRouter.post('/:chatId/messages', authenticate, sendMessageHandler);

export { chatsRouter };

