import type { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: 'Not Found' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('[error]', err);
  if (res.headersSent) {
    return;
  }

  const status = typeof err === 'object' && err && 'status' in err ? (err as any).status : 500;
  const message =
    typeof err === 'object' && err && 'message' in err ? (err as any).message : 'Unexpected error';

  res.status(status).json({ message });
}

