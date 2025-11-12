import type { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';

import { firebaseAuth } from '../config/firebase';
import { isAdminUser } from '../utils/admin';

type AppDecodedIdToken = DecodedIdToken & { isAdmin?: boolean };

declare module 'express-serve-static-core' {
  interface Request {
    user?: AppDecodedIdToken;
  }
}

const BEARER_PREFIX = /^bearer\s+/i;

function extractBearerToken(authHeader?: string | null) {
  if (!authHeader) return null;
  const match = authHeader.match(BEARER_PREFIX);
  if (match) {
    return authHeader.slice(match[0].length).trim();
  }
  return authHeader.trim();
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }

    const token = extractBearerToken(authHeader);
    if (!token) {
      return res.status(401).json({ message: 'Missing bearer token' });
    }

    const decoded = (await firebaseAuth.verifyIdToken(token)) as AppDecodedIdToken;
    decoded.isAdmin = isAdminUser(decoded);
    req.user = decoded;
    return next();
  } catch (error) {
    console.error('[auth] failed to verify token', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);
  if (!token) {
    return next();
  }

  firebaseAuth
    .verifyIdToken(token)
    .then((decoded) => {
      const enriched = decoded as AppDecodedIdToken;
      enriched.isAdmin = isAdminUser(enriched);
      req.user = enriched;
    })
    .catch((error) => {
      console.warn('[auth] optional token verification failed', error);
    })
    .finally(() => next());
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!isAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin privileges required' });
  }

  return next();
}


