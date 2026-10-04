import { validateEnv } from './env';

try {
  const env = validateEnv(process.env);
  console.log(`[check-env] OK (NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT})`);
  if (!env.RESEND_API_KEY?.trim()) {
    console.warn('[check-env] RESEND_API_KEY is not set — the contact form will answer with an error');
  }
} catch (err) {
  console.error(`[check-env] ${(err as Error).message}`);
  process.exit(1);
}
