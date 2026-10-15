// src/second-brain/auth/login-throttle.ts
import { Clock } from '../../common/clock';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

// Single-user, in-memory throttle: 5 failures within 15 min lock login for 15 min.
// The counter lives only in memory, so a redeploy resets it by design.
export class LoginThrottle {
  private failures: number[] = [];
  private lockedUntil: number | undefined;

  constructor(private readonly clock: Clock) {}

  isLocked(): boolean {
    return (
      this.lockedUntil !== undefined &&
      this.clock.now().getTime() < this.lockedUntil
    );
  }

  recordFailure(): void {
    if (this.isLocked()) {
      return;
    }
    const now = this.clock.now().getTime();
    // An expired lock clears everything; counting restarts from zero.
    this.lockedUntil = undefined;
    this.failures = this.failures.filter((at) => now - at < WINDOW_MS);
    this.failures.push(now);
    if (this.failures.length >= MAX_FAILURES) {
      this.failures = [];
      this.lockedUntil = now + LOCK_MS;
    }
  }

  registerSuccess(): void {
    this.failures = [];
    this.lockedUntil = undefined;
  }
}
