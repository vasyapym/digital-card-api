// src/second-brain/indexer/db.spec.ts
import { PrismaClient } from '@prisma/client';
import { createDbRunner } from './db';

jest.useFakeTimers();

const fakeClient = () =>
  ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
  }) as unknown as PrismaClient;

describe('createDbRunner', () => {
  let clients: PrismaClient[];

  beforeEach(() => {
    clients = [];
  });

  const runner = () =>
    createDbRunner('postgresql://fake', () => {
      const c = fakeClient();
      clients.push(c);
      return c;
    });

  const disconnectsOf = (c: PrismaClient): jest.Mock =>
    (c as unknown as { $disconnect: jest.Mock }).$disconnect;
  const clientsFrom = (op: jest.Mock): PrismaClient[] =>
    op.mock.calls.map((call) => call[0] as PrismaClient);

  it('runs an op once on the current client', async () => {
    const db = runner();
    const op = jest.fn().mockResolvedValue(42);
    await expect(db.run('test', op)).resolves.toBe(42);
    expect(op).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(1);
  });

  it('retries a rejected op on a FRESH client and disconnects the old one', async () => {
    const db = runner();
    const op = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'P1017' }))
      .mockResolvedValueOnce('second');
    const promise = db.run('test', op);
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(promise).resolves.toBe('second');
    expect(op).toHaveBeenCalledTimes(2);
    const [first, second] = clientsFrom(op);
    expect(first).not.toBe(second);
    expect(disconnectsOf(first)).toHaveBeenCalledTimes(1);
    expect(disconnectsOf(second)).not.toHaveBeenCalled();
  });

  it('caps a hung op at the attempt timeout, then retries fresh', async () => {
    const db = runner();
    const op = jest
      .fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce('after-hang');
    const promise = db.run('test', op);
    await jest.advanceTimersByTimeAsync(95_000);
    await expect(promise).resolves.toBe('after-hang');
    expect(op).toHaveBeenCalledTimes(2);
    const clientsUsed = clientsFrom(op);
    expect(clientsUsed[0]).not.toBe(clientsUsed[1]);
  });

  it('exhausts retries and rethrows the last error', async () => {
    const db = runner();
    const op = jest.fn().mockRejectedValue(new Error('down'));
    const asError = (p: Promise<unknown>): Promise<Error> => p.then(
      () => {
        throw new Error('should not resolve');
      },
      (e: Error) => e,
    );
    const outcome = asError(db.run('test', op));
    await jest.advanceTimersByTimeAsync(200_000);
    await expect(outcome).resolves.toMatchObject({ message: 'down' });
    expect(op).toHaveBeenCalledTimes(3);
    expect(disconnectsOf(clients[0])).toHaveBeenCalledTimes(1);
    expect(disconnectsOf(clients[1])).toHaveBeenCalledTimes(1);
    expect(disconnectsOf(clients[2])).not.toHaveBeenCalled();
  });

  it('once() bounds a single attempt and never rebuilds the client', async () => {
    const db = runner();
    const op = jest.fn(() => new Promise(() => undefined));
    const outcome = db.once('phase', op, 15_000).catch((e: Error) => e.message);
    await jest.advanceTimersByTimeAsync(16_000);
    await expect(outcome).resolves.toBe('phase timed out');
    expect(clients).toHaveLength(1);
  });
});
