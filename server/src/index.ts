import http from 'node:http';

import app from './app';
import { env } from './config/env';

const port = env.PORT;
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`API server ready on http://localhost:${port} (${env.NODE_ENV})`);
});

const shutdown = (signal: string) => {
  console.info(`Received ${signal}. Gracefully shutting down.`);
  server.close(() => {
    console.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

