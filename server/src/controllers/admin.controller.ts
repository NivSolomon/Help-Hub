import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';

import { firestore } from '../config/firebase';
import { serializeRequest } from './requests.controller';

const requestsCollection = firestore.collection('requests');
const usersCollection = firestore.collection('users');

function serializeTimestamp(value: any): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value === 'number') return value;
  return null;
}

export async function getAdminOverviewHandler(_req: Request, res: Response) {
  try {
    const [
      openSnapshot,
      acceptedSnapshot,
      inProgressSnapshot,
      doneSnapshot,
      usersSnapshot,
      recentRequestsSnapshot,
      recentUsersSnapshot
    ] = await Promise.all([
      requestsCollection.where('status', '==', 'open').select().get(),
      requestsCollection.where('status', '==', 'accepted').select().get(),
      requestsCollection.where('status', '==', 'in_progress').select().get(),
      requestsCollection.where('status', '==', 'done').select().get(),
      usersCollection.select().get(),
      requestsCollection.orderBy('createdAt', 'desc').limit(8).get(),
      usersCollection.orderBy('createdAt', 'desc').limit(8).get()
    ]);

    const stats = {
      openRequests: openSnapshot.size,
      activeRequests: acceptedSnapshot.size + inProgressSnapshot.size,
      completedRequests: doneSnapshot.size,
      totalUsers: usersSnapshot.size
    };

    const recentRequests = recentRequestsSnapshot.docs
      .map((doc) => {
        const serialized = serializeRequest(doc);
        if (!serialized) return null;
        return {
          id: serialized.id,
          title: typeof serialized.title === 'string' ? serialized.title : '',
          status: typeof serialized.status === 'string' ? serialized.status : 'open',
          requesterId: typeof serialized.requesterId === 'string' ? serialized.requesterId : null,
          helperId: typeof serialized.helperId === 'string' ? serialized.helperId : null,
          createdAt: serializeTimestamp(serialized.createdAt),
          updatedAt: serializeTimestamp(serialized.updatedAt)
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const recentUsers = recentUsersSnapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        email: typeof data.email === 'string' ? data.email : null,
        createdAt: serializeTimestamp(data.createdAt),
        roles: data.roles ?? null
      };
    });

    return res.json({
      stats,
      recentRequests,
      recentUsers
    });
  } catch (error) {
    console.error('[admin] overview failed', error);
    return res.status(500).json({ message: 'Failed to load admin overview' });
  }
}


