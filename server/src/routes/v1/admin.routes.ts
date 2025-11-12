import { Router } from 'express';

import { getAdminOverviewHandler } from '../../controllers/admin.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';

const adminRouter = Router();

adminRouter.get('/overview', authenticate, requireAdmin, getAdminOverviewHandler);

export { adminRouter };


