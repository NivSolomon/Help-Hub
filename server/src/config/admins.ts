const DEFAULT_ADMIN_EMAILS = ['nivsolomon3@gmail.com'];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const envEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean)
  .map(normalizeEmail);

export const ADMIN_EMAILS = new Set<string>(
  envEmails.length > 0 ? envEmails : DEFAULT_ADMIN_EMAILS.map(normalizeEmail)
);

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(normalizeEmail(email));
}

