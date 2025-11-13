import express from 'express';
import cors from 'cors';

import { env } from './config/env';
import { router as v1Router } from './routes/v1';

const app = express();

app.use(
  cors({
    origin: env.CLIENT_URL ?? true,
  })
);
app.use(express.json());

app.use('/api/v1', v1Router);

app.listen(env.PORT, () => {
  console.log(`API server ready on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
