import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const stripWrappingQuotes = (val?: string | null) => {
  if (!val) return val ?? undefined;
  const trimmed = val.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().optional(),
  MAIL_SECURE: z
    .string()
    .optional()
    .transform((val) =>
      val ? val === 'true' || val === '1' || val.toLowerCase() === 'yes' : undefined
    ),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  FIREBASE_PROJECT_ID: z
    .string()
    .optional()
    .transform(stripWrappingQuotes),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .optional()
    .transform(stripWrappingQuotes),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((val) => {
      const unwrapped = stripWrappingQuotes(val);
      return unwrapped ? unwrapped.replace(/\\n/g, '\n') : unwrapped;
    }),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Failed to parse environment variables');
}

export const env = parsed.data;

