import { Router } from 'express';
import { forgotPasswordHandler } from '../../controllers/auth.controller';

const router = Router();

router.post('/forgot-password', forgotPasswordHandler);

export const authRouter = router;


