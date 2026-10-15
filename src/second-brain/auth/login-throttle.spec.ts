// src/second-brain/auth/login-throttle.spec.ts
import { Clock } from '../../common/clock';
import { LoginThrottle } from './login-throttle';

const MINUTE_MS = 60 * 1000;
const START_MS = 1700000000000;

// Tiny mutable clock; tests advance it explicitly instead of using fake timers.
function fakeClock(): Clock & { advance(ms: number): void } {
  let current = START_MS;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function fail(throttle: LoginThrottle, times: number): void {
  for (let i = 0; i < times; i += 1) {
    throttle.recordFailure();
  }
}

describe('LoginThrottle', () => {
  it('starts unlocked', () => {
    expect(new LoginThrottle(fakeClock()).isLocked()).toBe(false);
  });

  it('stays unlocked after four failures', () => {
    const throttle = new LoginThrottle(fakeClock());
    fail(throttle, 4);
    expect(throttle.isLocked()).toBe(false);
  });

  it('resets the counter on success: 4 fails + success + 2 fails is not locked', () => {
    const throttle = new LoginThrottle(fakeClock());
    fail(throttle, 4);
    throttle.registerSuccess();
    fail(throttle, 2);
    expect(throttle.isLocked()).toBe(false);
    fail(throttle, 2);
    expect(throttle.isLocked()).toBe(false);
    fail(throttle, 1);
    expect(throttle.isLocked()).toBe(true);
  });

  it('locks on the fifth failure', () => {
    const throttle = new LoginThrottle(fakeClock());
    fail(throttle, 5);
    expect(throttle.isLocked()).toBe(true);
  });

  it('unlocks once 15 minutes have passed', () => {
    const clock = fakeClock();
    const throttle = new LoginThrottle(clock);
    fail(throttle, 5);
    clock.advance(15 * MINUTE_MS - 1);
    expect(throttle.isLocked()).toBe(true);
    clock.advance(2);
    expect(throttle.isLocked()).toBe(false);
  });

  it('does not extend the lock when a failure arrives while locked', () => {
    const clock = fakeClock();
    const throttle = new LoginThrottle(clock);
    fail(throttle, 5);
    clock.advance(10 * MINUTE_MS);
    throttle.recordFailure();
    expect(throttle.isLocked()).toBe(true);
    clock.advance(5 * MINUTE_MS + 1);
    expect(throttle.isLocked()).toBe(false);
  });

  it('restarts counting from zero after the lock expires', () => {
    const clock = fakeClock();
    const throttle = new LoginThrottle(clock);
    fail(throttle, 5);
    clock.advance(15 * MINUTE_MS + 1);
    fail(throttle, 4);
    expect(throttle.isLocked()).toBe(false);
    fail(throttle, 1);
    expect(throttle.isLocked()).toBe(true);
  });

  it('prunes failures older than the 15 minute window', () => {
    const clock = fakeClock();
    const throttle = new LoginThrottle(clock);
    fail(throttle, 4);
    clock.advance(15 * MINUTE_MS + 1);
    fail(throttle, 4);
    expect(throttle.isLocked()).toBe(false);
    fail(throttle, 1);
    expect(throttle.isLocked()).toBe(true);
  });

  it('counts failures spread across the window', () => {
    const clock = fakeClock();
    const throttle = new LoginThrottle(clock);
    fail(throttle, 2);
    clock.advance(14 * MINUTE_MS);
    fail(throttle, 2);
    expect(throttle.isLocked()).toBe(false);
    fail(throttle, 1);
    expect(throttle.isLocked()).toBe(true);
  });

  it('clears an active lock on success', () => {
    const throttle = new LoginThrottle(fakeClock());
    fail(throttle, 5);
    expect(throttle.isLocked()).toBe(true);
    throttle.registerSuccess();
    expect(throttle.isLocked()).toBe(false);
    fail(throttle, 4);
    expect(throttle.isLocked()).toBe(false);
  });
});
