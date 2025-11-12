import type { DecodedIdToken } from 'firebase-admin/auth';

import { isAdminEmail } from '../config/admins';

export function isAdminUser(user?: DecodedIdToken | null): boolean {
  if (!user) return false;
  if ((user as any).isAdmin === true) return true;
  if (user.email && isAdminEmail(user.email)) return true;
  return false;
}


