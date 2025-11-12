import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { firestore } from '../config/firebase';

const promptsCollection = firestore.collection('review_prompts');
const reviewsCollection = firestore.collection('reviews');

const createPromptsSchema = z.object({
  requestId: z.string().min(1),
  requesterId: z.string().min(1),
  helperId: z.string().min(1),
  requestTitle: z.string().min(1)
});

const submitReviewSchema = z.object({
  requestId: z.string().min(1),
  revieweeId: z.string().min(1),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  imageUrl: z.string().url().nullable().optional(),
  requestTitle: z.string().nullable().optional()
});

function serializeTimestamp(value?: Timestamp | null) {
  if (!value) return null;
  return value.toMillis();
}

export async function createReviewPromptsHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = createPromptsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parsed.error.flatten() });
  }

  const { requestId, requesterId, helperId, requestTitle } = parsed.data;
  if (req.user.uid !== requesterId && req.user.uid !== helperId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    await Promise.all([
      promptsCollection.add({
        userId: requesterId,
        requestId,
        requestTitle,
        revieweeId: helperId,
        createdAt: FieldValue.serverTimestamp(),
        consumed: false
      }),
      promptsCollection.add({
        userId: helperId,
        requestId,
        requestTitle,
        revieweeId: requesterId,
        createdAt: FieldValue.serverTimestamp(),
        consumed: false
      })
    ]);

    return res.status(201).json({ message: 'Prompts created' });
  } catch (error) {
    console.error('[reviews] create prompts failed', error);
    return res.status(500).json({ message: 'Failed to create prompts' });
  }
}

export async function submitReviewHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsedParams = z.object({ requestId: z.string().min(1) }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  const parsedBody = submitReviewSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parsedBody.error.flatten() });
  }

  const { requestId: paramsRequestId } = parsedParams.data;
  const { requestId, revieweeId, rating, comment, imageUrl, requestTitle } = parsedBody.data;

  if (paramsRequestId !== requestId) {
    return res.status(400).json({ message: 'Mismatched request id' });
  }

  try {
    const docRef = await reviewsCollection.add({
      requestId,
      requestTitle: requestTitle ?? null,
      reviewerId: req.user.uid,
      revieweeId,
      rating,
      comment: comment ?? null,
      imageUrl: imageUrl ?? null,
      createdAt: FieldValue.serverTimestamp()
    });

    const snapshot = await docRef.get();
    return res.status(201).json({
      id: snapshot.id,
      ...(snapshot.data() as Record<string, unknown>),
      createdAt: serializeTimestamp((snapshot.data() as any)?.createdAt)
    });
  } catch (error) {
    console.error('[reviews] submit failed', error);
    return res.status(500).json({ message: 'Failed to submit review' });
  }
}

export async function listReviewPromptsHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const snapshot = await promptsCollection
      .where('userId', '==', req.user.uid)
      .where('consumed', '==', false)
      .get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        requestId: data.requestId,
        requestTitle: data.requestTitle,
        revieweeId: data.revieweeId,
        consumed: data.consumed,
        createdAt: serializeTimestamp(data.createdAt)
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error('[reviews] list prompts failed', error);
    return res.status(500).json({ message: 'Failed to fetch review prompts' });
  }
}

export async function consumePromptHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const paramsSchema = z.object({ promptId: z.string().min(1) });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid prompt id' });
  }

  const { promptId } = parsed.data;

  try {
    const ref = promptsCollection.doc(promptId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ message: 'Prompt not found' });
    }
    const data = snapshot.data();
    if (data?.userId !== req.user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await ref.update({
      consumed: true,
      updatedAt: FieldValue.serverTimestamp()
    });
    return res.json({ message: 'Prompt consumed' });
  } catch (error) {
    console.error('[reviews] consume prompt failed', error);
    return res.status(500).json({ message: 'Failed to update prompt' });
  }
}

export async function fetchUserReviewsHandler(req: Request, res: Response) {
  const paramsSchema = z.object({ userId: z.string().min(1) });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const { userId } = parsed.data;

  try {
    const snapshot = await reviewsCollection
      .where('revieweeId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        rating: data.rating ?? 0,
        comment: data.comment ?? '',
        requestId: data.requestId,
        requestTitle: data.requestTitle ?? null,
        imageUrl: data.imageUrl ?? null,
        createdAt: serializeTimestamp(data.createdAt)
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error('[reviews] fetch user reviews failed', error);
    return res.status(500).json({ message: 'Failed to fetch reviews' });
  }
}

export async function getUserAverageRatingHandler(req: Request, res: Response) {
  const paramsSchema = z.object({ userId: z.string().min(1) });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const { userId } = parsed.data;

  try {
    const snapshot = await reviewsCollection.where('revieweeId', '==', userId).get();
    if (snapshot.empty) {
      return res.json({ avg: null, count: 0 });
    }

    const ratings = snapshot.docs.map((doc) => (doc.data().rating ?? 0) as number);
    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return res.json({ avg: sum / ratings.length, count: ratings.length });
  } catch (error) {
    console.error('[reviews] average failed', error);
    return res.status(500).json({ message: 'Failed to compute average rating' });
  }
}

