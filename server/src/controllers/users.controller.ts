import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { firestore } from '../config/firebase';
import { isAdminEmail } from '../config/admins';

const usersCollection = firestore.collection('users');

const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  displayName: z.string().min(1).max(240).optional(),
  photoURL: z.string().url().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bio: z.string().max(280).nullable().optional(),
  birthdateISO: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
});

const onboardingSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  phone: z.string().min(4).max(40),
  address: z.string().min(1).max(240),
  birthdateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bio: z.string().max(280).optional()
});

const ensureSeedSchema = profileUpdateSchema.extend({
  photoURL: z.string().url().nullable().optional(),
  email: z.string().email().nullable().optional()
});
function serializeTimestamp(value: any) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value === 'number') return value;
  return null;
}

function serializeUser(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return null;
  const rolesData = (data.roles as Record<string, unknown> | undefined) ?? {};
  const email = typeof data.email === 'string' ? data.email : null;
  const admin =
    rolesData && typeof rolesData === 'object' && 'admin' in rolesData
      ? Boolean((rolesData as Record<string, unknown>).admin)
      : isAdminEmail(email);

  return {
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    bio: data.bio ?? null,
    birthdateISO: data.birthdateISO ?? null,
    birthdateSetAt: serializeTimestamp(data.birthdateSetAt),
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    roles: {
      admin
    },
    isAdmin: admin
  };
}

function computeAdminFlag({
  explicit,
  fallbackEmail
}: {
  explicit?: boolean;
  fallbackEmail?: string | null;
}) {
  if (explicit) return true;
  if (fallbackEmail && isAdminEmail(fallbackEmail)) return true;
  return false;
}

export async function ensureUserDocHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const uid = req.user.uid;
  const seedParse = ensureSeedSchema.partial().safeParse(req.body ?? {});
  if (!seedParse.success) {
    return res.status(400).json({ message: 'Invalid seed', errors: seedParse.error.flatten() });
  }
  const seed = seedParse.data ?? {};

  try {
    const ref = usersCollection.doc(uid);
    const snapshot = await ref.get();
    const baseEmail =
      seed.email ??
      req.user.email ??
      (snapshot.exists ? ((snapshot.data() as Record<string, unknown>)?.email as string | undefined) ?? null : null);
    const shouldBeAdmin = computeAdminFlag({
      explicit: req.user?.isAdmin,
      fallbackEmail: baseEmail ?? null
    });

    if (!snapshot.exists) {
      const body = {
        firstName: seed.firstName ?? null,
        lastName: seed.lastName ?? null,
        displayName:
          seed.displayName ??
          ([seed.firstName, seed.lastName].filter(Boolean).join(' ') || null),
        photoURL: seed.photoURL ?? req.user.picture ?? null,
        email: baseEmail ?? null,
        phone: seed.phone ?? null,
        address: seed.address ?? null,
        bio: seed.bio ?? null,
        birthdateISO: seed.birthdateISO ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        roles: {
          admin: shouldBeAdmin
        }
      };
      await ref.set(body, { merge: true });
      const created = await ref.get();
      const serializedCreated = serializeUser(created.data()) ?? {};
      return res.status(201).json({ id: uid, ...serializedCreated });
    }

    const data = snapshot.data();
    if (shouldBeAdmin) {
      const currentRoles = (data?.roles as Record<string, unknown> | undefined) ?? {};
      if (!currentRoles.admin) {
        await ref.set({ roles: { admin: true }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        const updatedSnapshot = await ref.get();
        const serializedUpdated = serializeUser(updatedSnapshot.data()) ?? {};
        return res.json({ id: uid, ...serializedUpdated });
      }
    }

    const serialized = serializeUser(data) ?? {};
    return res.json({ id: uid, ...serialized });
  } catch (error) {
    console.error('[users] ensure failed', error);
    return res.status(500).json({ message: 'Failed to ensure user profile' });
  }
}

export async function getMeHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const snapshot = await usersCollection.doc(req.user.uid).get();
    if (!snapshot.exists) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const serialized = serializeUser(snapshot.data()) ?? {};
    return res.json({ id: snapshot.id, ...serialized });
  } catch (error) {
    console.error('[users] get me failed', error);
    return res.status(500).json({ message: 'Failed to fetch profile' });
  }
}

export async function updateProfileHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parsed.error.flatten() });
  }

  try {
    const ref = usersCollection.doc(req.user.uid);
    const payload = {
      ...parsed.data,
      updatedAt: FieldValue.serverTimestamp()
    };
    await ref.set(payload, { merge: true });
    const updated = await ref.get();
    const serialized = serializeUser(updated.data()) ?? {};
    return res.json({ id: updated.id, ...serialized });
  } catch (error) {
    console.error('[users] update failed', error);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
}

export async function onboardingProfileHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parsed.error.flatten() });
  }

  const { firstName, lastName, phone, address, birthdateISO, bio } = parsed.data;
  const displayName = `${firstName} ${lastName}`.trim();

  try {
    const ref = usersCollection.doc(req.user.uid);
    const payload: Record<string, unknown> = {
      firstName,
      lastName,
      displayName,
      phone,
      address,
      birthdateISO,
      birthdateSetAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    if (typeof bio === 'string') {
      payload.bio = bio.trim();
    }

    await ref.set(payload, { merge: true });

    const snapshot = await ref.get();
    const serialized = serializeUser(snapshot.data()) ?? {};
    return res.json({ id: snapshot.id, ...serialized });
  } catch (error) {
    console.error('[users] onboarding failed', error);
    return res.status(500).json({ message: 'Failed to save onboarding profile' });
  }
}

export async function getUserHandler(req: Request, res: Response) {
  const paramsSchema = z.object({ userId: z.string().min(1) });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    const snapshot = await usersCollection.doc(parsed.data.userId).get();
    if (!snapshot.exists) {
      return res.status(404).json({ message: 'User not found' });
    }
    const serialized = serializeUser(snapshot.data()) ?? {};
    return res.json({ id: snapshot.id, ...serialized });
  } catch (error) {
    console.error('[users] get user failed', error);
    return res.status(500).json({ message: 'Failed to fetch user' });
  }
}

