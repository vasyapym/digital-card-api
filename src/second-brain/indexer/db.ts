// src/second-brain/indexer/db.ts
import { PrismaClient } from '@prisma/client';

/**
 * Bounded database access for the indexer CLI. Runs #10 and #11 proved a single
 * wedged call can freeze the whole run silently for half an hour — and CI step
 * logs only publish after the step ends, so a frozen step looks exactly like a
 * slow one. Every call therefore carries a hard per-attempt cap and retries on
 * a FRESH client: a hang pins one socket, so retrying on it never recovers.
 */

export const DB_ATTEMPTS = 3;
export const DB_ATTEMPT_TIMEOUT_MS = 90_000;
export const DB_RETRY_PAUSE_MS = 2_000;

export interface DbRunner {
  /** Bounded call: per-attempt cap, then retry on a fresh client (idempotent ops only). */
  run<T>(label: string, op: (client: PrismaClient) => Promise<T>): Promise<T>;
  /** Single bounded attempt, no rebuild — best-effort telemetry writes only. */
  once<T>(label: string, op: (client: PrismaClient) => Promise<T>, timeoutMs: number): Promise<T>;
  /** Disconnects the current client; wedged ones were closed on rebuild. */
  close(): Promise<void>;
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createDbRunner(
  url: string,
  newClient: () => PrismaClient = () =>
    new PrismaClient({ datasources: { db: { url } } }),
): DbRunner {
  let client = newClient();

  async function rebuild(): Promise<void> {
    const stale = client;
    client = newClient();
    await stale.$disconnect().catch(() => undefined);
  }

  /** Races op against the cap; a late settle after the cap must never reach
      the process-level unhandledRejection handler. */
  function race<T>(label: string, op: Promise<T>, timeoutMs: number): Promise<T> {
    op.catch(() => undefined);
    let timer: NodeJS.Timeout | null = null;
    return Promise.race([
      op,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
        if (timer.unref) timer.unref();
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  return {
    async run<T>(label: string, op: (client: PrismaClient) => Promise<T>): Promise<T> {
      for (let attempt = 1; attempt <= DB_ATTEMPTS; attempt += 1) {
        try {
          return await race(label, op(client), DB_ATTEMPT_TIMEOUT_MS);
        } catch (err) {
          if (attempt === DB_ATTEMPTS) throw err;
          console.log(`index: db-retry ${label} attempt=${attempt}`);
          await rebuild();
          await pause(DB_RETRY_PAUSE_MS * attempt);
        }
      }
      throw new Error(`${label} retries exhausted`);
    },

    async once<T>(label: string, op: (client: PrismaClient) => Promise<T>, timeoutMs: number): Promise<T> {
      return race(label, op(client), timeoutMs);
    },

    async close(): Promise<void> {
      await client.$disconnect().catch(() => undefined);
    },
  };
}
