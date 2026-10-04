import { validateEnv } from './env';

try {
  const env = validateEnv(process.env);
  console.log(`[check-env] OK (NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT})`);
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.warn('[check-env] SMTP_USER/SMTP_PASS are not set — the contact form will answer with an error');
  }
} catch (err) {
  console.error(`[check-env] ${(err as Error).message}`);
  process.exit(1);
}
