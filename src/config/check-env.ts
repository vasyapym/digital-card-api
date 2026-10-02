import { validateEnv } from './env';

try {
  const env = validateEnv(process.env);
  console.log(`[check-env] OK (NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT})`);
} catch (err) {
  console.error(`[check-env] ${(err as Error).message}`);
  process.exit(1);
}
