import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/v1/auth.routes';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/v1/auth', authRoutes);

app.listen(env.PORT, () => {
  console.log(`API server ready on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
