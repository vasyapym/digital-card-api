import { z } from 'zod';

const postgresUrl = z
  .string()
  .url('должен быть корректный URL')
  .refine((u) => /^postgres(ql)?:\/\//.test(u), 'ожидается схема postgres:// или postgresql://');

const envSchemaBase = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,
  RESEND_API_KEY: z.string().optional(),

  // second brain (M0/M1) — every flag defaults OFF; with none of them set the app
  // behaves exactly as before. BRAIN_SEMANTIC=false (keyword-only search) is a
  // supported mode, never an error.
  BRAIN_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  BRAIN_PASSPHRASE_HASH: z.string().startsWith('$argon2id$').optional(),
  BRAIN_SESSION_SECRET: z.string().min(32).optional(),
  BRAIN_SEMANTIC: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const envSchema = envSchemaBase.superRefine((env, ctx) => {
  if (!env.BRAIN_ENABLED) return;
  if (!env.BRAIN_PASSPHRASE_HASH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BRAIN_PASSPHRASE_HASH'],
      message: 'BRAIN_PASSPHRASE_HASH is required when BRAIN_ENABLED=true',
    });
  }
  if (!env.BRAIN_SESSION_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BRAIN_SESSION_SECRET'],
      message: 'BRAIN_SESSION_SECRET is required when BRAIN_ENABLED=true',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Некорректные переменные окружения:\n${details}`);
  }
  return result.data;
}
