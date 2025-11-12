import { Router } from 'express';
import { escalateSupportHandler } from '../../controllers/support.controller';

const router = Router();

router.post('/escalate', escalateSupportHandler);

export const supportRouter = router;


