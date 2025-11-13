import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, '../../.env') });

const stripWrappingQuotes = (val?: string | null) => {
  if (!val) return val ?? undefined;
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().url().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional().transform((val) => {
    const unwrapped = stripWrappingQuotes(val);
    return unwrapped ? unwrapped.replace(/\\n/g, '\n') : unwrapped;
  }),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_SECURE: z
    .string()
    .optional()
    .transform((val) =>
      val ? ['true', '1', 'yes'].includes(val.toLowerCase()) : undefined
    ),
  MAIL_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Failed to parse environment variables');
}

console.log('[ENV LOADED]', {
  MAIL_HOST: parsed.data.MAIL_HOST,
  MAIL_USER: parsed.data.MAIL_USER,
  MAIL_PASS: parsed.data.MAIL_PASS ? '✔️ Loaded' : '❌ Missing',
});

export const env = parsed.data;
