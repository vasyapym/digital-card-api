import { z } from 'zod';

const postgresUrl = z
  .string()
  .url('должен быть корректный URL')
  .refine((u) => /^postgres(ql)?:\/\//.test(u), 'ожидается схема postgres:// или postgresql://');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,
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
