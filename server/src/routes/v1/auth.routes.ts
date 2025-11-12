import express from 'express';
import { forgotPasswordHandler } from '../../controllers/auth.controller';

const router = express.Router();

router.post('/forgot-password', forgotPasswordHandler);

export default router;
