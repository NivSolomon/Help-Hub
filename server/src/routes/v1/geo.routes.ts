import { Router } from 'express';

import {
  reverseGeocodeHandler,
  searchGeocodeHandler
} from '../../controllers/geo.controller';

const router = Router();

router.get('/search', searchGeocodeHandler);
router.get('/reverse', reverseGeocodeHandler);

export const geoRouter = router;


