import type { Request, Response } from 'express';
import { geohashForLocation } from 'geofire-common';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { firestore } from '../config/firebase';
import { isAdminUser } from '../utils/admin';

const requestsCollection = firestore.collection('requests');

const createRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['errand', 'carry', 'fix', 'other']).default('other'),
  reward: z.string().trim().min(1).optional(),
  address: z
    .object({
      city: z.string().optional(),
      street: z.string().optional(),
      houseNumber: z.string().optional(),
      notes: z.string().optional()
    })
    .optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  })
});

const boundsSchema = z
  .object({
    west: z.coerce.number(),
    south: z.coerce.number(),
    east: z.coerce.number(),
    north: z.coerce.number()
  })
  .partial()
  .refine(
    (val) =>
      val.west !== undefined &&
      val.south !== undefined &&
      val.east !== undefined &&
      val.north !== undefined,
    {
      message: 'bounds require west,south,east,north',
      path: ['bounds']
    }
  );

const updateStatusSchema = z.object({
  nextStatus: z.enum(['accepted', 'in_progress']).default('accepted')
});

const requestIdSchema = z.object({
  requestId: z.string().min(1)
});

function serializeTimestamp(value?: Timestamp | null) {
  if (!value) return null;
  return value.toMillis();
}

export type SerializedRequest = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  reward?: string | null;
  address?: Record<string, unknown> | null;
  requesterId?: string;
  helperId?: string | null;
  status?: string;
  location?: { lat?: number; lng?: number } | null;
  geohash?: string;
  createdAt: number | null;
  updatedAt: number | null;
  [key: string]: unknown;
};

export function serializeRequest(doc: DocumentSnapshot): SerializedRequest | null {
  const data = doc.data() as Record<string, unknown>;
  if (!data) return null;

  const location = data.location && typeof data.location === 'object' ? (data.location as Record<string, unknown>) : null;

  const serialized: SerializedRequest = {
    id: doc.id,
    title: typeof data.title === 'string' ? data.title : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    category: typeof data.category === 'string' ? data.category : undefined,
    reward: typeof data.reward === 'string' ? data.reward : null,
    address: (data.address as Record<string, unknown> | null | undefined) ?? null,
    requesterId: typeof data.requesterId === 'string' ? data.requesterId : undefined,
    helperId: typeof data.helperId === 'string' ? data.helperId : null,
    status: typeof data.status === 'string' ? data.status : undefined,
    location: location as { lat?: number; lng?: number } | null,
    geohash: typeof data.geohash === 'string' ? data.geohash : undefined,
    createdAt: serializeTimestamp(data.createdAt as Timestamp | undefined),
    updatedAt: serializeTimestamp(data.updatedAt as Timestamp | undefined)
  };

  return { ...serialized, ...data };
}

export async function createRequestHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request body', errors: parsed.error.flatten() });
  }

  const { title, description, category, reward, address, location } = parsed.data;

  try {
    const geohash = geohashForLocation([location.lat, location.lng]);
    const docRef = requestsCollection.doc();
    const payload = {
      title,
      description: description ?? '',
      category,
      reward: reward ?? null,
      address: address ?? null,
      requesterId: req.user.uid,
      status: 'open',
      location,
      geohash,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await docRef.set(payload);
    const snapshot = await docRef.get();
    const serialized = serializeRequest(snapshot);
    return res.status(201).json(serialized);
  } catch (error) {
    console.error('[requests] create failed', error);
    return res.status(500).json({ message: 'Failed to create request' });
  }
}

export async function listOpenRequestsHandler(req: Request, res: Response) {
  const boundsInput =
    req.query.west && req.query.south && req.query.east && req.query.north
      ? {
          west: req.query.west,
          south: req.query.south,
          east: req.query.east,
          north: req.query.north
        }
      : undefined;

  let bounds: z.infer<typeof boundsSchema> | undefined;
  if (boundsInput) {
    const parsedBounds = boundsSchema.safeParse(boundsInput);
    if (!parsedBounds.success) {
      return res.status(400).json({ message: parsedBounds.error.message });
    }
    bounds = parsedBounds.data;
  }

  try {
    let query = requestsCollection.where('status', '==', 'open').limit(500);

    const snapshots = await query.get();
    let items = snapshots.docs
      .map((doc) => serializeRequest(doc))
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));

    if (bounds) {
      items = items.filter((item) => {
        const location = item.location as { lat?: number; lng?: number } | undefined;
        if (!location?.lat || !location?.lng) {
          return false;
        }
        return (
          location.lng >= bounds!.west! &&
          location.lng <= bounds!.east! &&
          location.lat >= bounds!.south! &&
          location.lat <= bounds!.north!
        );
      });
    }

    return res.json({ items });
  } catch (error) {
    console.error('[requests] list open failed', error);
    return res.status(500).json({ message: 'Failed to fetch requests' });
  }
}

export async function listParticipatingRequestsHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const uid = req.user.uid;

  try {
    const [requesterAccepted, requesterInProgress, helperAccepted, helperInProgress] =
      await Promise.all([
        requestsCollection.where('requesterId', '==', uid).where('status', '==', 'accepted').get(),
        requestsCollection.where('requesterId', '==', uid).where('status', '==', 'in_progress').get(),
        requestsCollection.where('helperId', '==', uid).where('status', '==', 'accepted').get(),
        requestsCollection.where('helperId', '==', uid).where('status', '==', 'in_progress').get()
      ]);

    const items = [
      ...requesterAccepted.docs,
      ...requesterInProgress.docs,
      ...helperAccepted.docs,
      ...helperInProgress.docs
    ]
      .reduce((acc, doc) => {
        acc.set(doc.id, doc);
        return acc;
      }, new Map<string, FirebaseFirestore.DocumentSnapshot>())
      .values();

    const serialized = Array.from(items)
      .map((doc) => serializeRequest(doc))
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));

    return res.json({ items: serialized });
  } catch (error) {
    console.error('[requests] list participating failed', error);
    return res.status(500).json({ message: 'Failed to fetch participating requests' });
  }
}

export async function listUserHistoryHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const uid = req.user.uid;

  try {
    const [requesterDocs, helperDocs] = await Promise.all([
      requestsCollection.where('requesterId', '==', uid).limit(500).get(),
      requestsCollection.where('helperId', '==', uid).limit(500).get()
    ]);

    const combined = [...requesterDocs.docs, ...helperDocs.docs].reduce((acc, doc) => {
      acc.set(doc.id, doc);
      return acc;
    }, new Map<string, FirebaseFirestore.DocumentSnapshot>());

    const items = Array.from(combined.values())
      .map((doc) => serializeRequest(doc))
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
      .sort((a, b) => {
        const ta = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const tb = typeof b.createdAt === 'number' ? b.createdAt : 0;
        return tb - ta;
      });

    return res.json({ items });
  } catch (error) {
    console.error('[requests] history failed', error);
    return res.status(500).json({ message: 'Failed to fetch requests' });
  }
}

export async function acceptRequestHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const paramsSchema = z.object({
    requestId: z.string().min(1)
  });

  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  const body = updateStatusSchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ message: 'Invalid body', errors: body.error.flatten() });
  }

  const { requestId } = parsedParams.data;
  const { nextStatus } = body.data;
  const helperId = req.user.uid;

  try {
    await firestore.runTransaction(async (tx) => {
      const ref = requestsCollection.doc(requestId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        throw Object.assign(new Error('Request not found'), { status: 404 });
      }
      const data = snapshot.data() as Record<string, unknown>;
      if (data.status !== 'open') {
        throw Object.assign(new Error('Request already claimed'), { status: 409 });
      }
      tx.update(ref, {
        helperId,
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    const updated = await requestsCollection.doc(requestId).get();
    const serialized = serializeRequest(updated)!;
    return res.json(serialized);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Failed to accept request';
    console.error('[requests] accept failed', error);
    return res.status(status).json({ message });
  }
}

export async function markRequestDoneHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const paramsSchema = z.object({
    requestId: z.string().min(1)
  });
  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  const { requestId } = parsedParams.data;
  const uid = req.user.uid;

  try {
    await firestore.runTransaction(async (tx) => {
      const ref = requestsCollection.doc(requestId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        throw Object.assign(new Error('Request not found'), { status: 404 });
      }
      const data = snapshot.data() as Record<string, unknown>;
      const participants = [data.requesterId, data.helperId].filter(Boolean);
      if (!participants.includes(uid)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }

      tx.update(ref, {
        status: 'done',
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    const updated = await requestsCollection.doc(requestId).get();
    const serialized = serializeRequest(updated)!;
    return res.json(serialized);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Failed to update request';
    console.error('[requests] mark done failed', error);
    return res.status(status).json({ message });
  }
}

export async function deleteOpenRequestHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const params = requestIdSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  const { requestId } = params.data;
  const uid = req.user.uid;
  const admin = isAdminUser(req.user);

  try {
    await firestore.runTransaction(async (tx) => {
      const ref = requestsCollection.doc(requestId);
      const snapshot = await tx.get(ref);

      if (!snapshot.exists) {
        throw Object.assign(new Error('Request not found'), { status: 404 });
      }

      const data = snapshot.data() as Record<string, unknown>;
      if (!admin && data.requesterId !== uid) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }

      if (!admin) {
        if (data.status !== 'open' || data.helperId) {
          throw Object.assign(new Error('Cannot delete after acceptance'), {
            status: 409
          });
        }
      }

      tx.delete(ref);
    });

    return res.status(204).send();
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Failed to delete request';
    console.error('[requests] delete open failed', error);
    return res.status(status).json({ message });
  }
}

