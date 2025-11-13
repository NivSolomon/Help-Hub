import { Router } from 'express';

import { forgotPasswordHandler } from '../../controllers/auth.controller';

const authRouter = Router();

authRouter.post('/forgot-password', forgotPasswordHandler);

export { authRouter };
