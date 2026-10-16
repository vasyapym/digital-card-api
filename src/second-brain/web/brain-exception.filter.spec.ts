// src/second-brain/web/brain-exception.filter.spec.ts
import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BrainExceptionFilter } from './brain-exception.filter';
import { applyBrainHeaders } from './security-headers';
import { BrainLayoutView } from '../views/layout';
import { UnauthenticatedException } from '../auth/session.guard';

// Hand-written stand-in for the slice of express.Response the filter uses.
interface FakeResponse {
  headersSent: boolean;
  statusCalls: number[];
  headers: Map<string, string>;
  body: string | null;
  status(code: number): FakeResponse;
  setHeader(name: string, value: string): void;
  send(payload: string): void;
}

function makeResponse(): FakeResponse {
  const res: FakeResponse = {
    headersSent: false,
    statusCalls: [],
    headers: new Map<string, string>(),
    body: null,
    status(code: number): FakeResponse {
      res.statusCalls.push(code);
      return res;
    },
    setHeader(name: string, value: string): void {
      res.headers.set(name, value);
    },
    send(payload: string): void {
      res.body = payload;
    },
  };
  return res;
}

function makeHost(res: FakeResponse): ArgumentsHost {
  const host = { switchToHttp: () => ({ getResponse: () => res }) };
  return host as unknown as ArgumentsHost;
}

// The keys the real header helper writes, captured from a throwaway response.
function securityHeaderKeys(): string[] {
  const probe = makeResponse();
  applyBrainHeaders(probe);
  return Array.from(probe.headers.keys());
}

function expectSecurityHeaders(res: FakeResponse): void {
  const keys = securityHeaderKeys();
  expect(keys).toHaveLength(5);
  for (const key of keys) {
    expect(res.headers.has(key)).toBe(true);
  }
}

function silenceLogger(): jest.SpyInstance {
  return jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
}

describe('BrainExceptionFilter', () => {
  const filter = new BrainExceptionFilter(new BrainLayoutView());

  it('redirects an unauthenticated request to the login page with next', () => {
    const res = makeResponse();
    filter.catch(new UnauthenticatedException('/brain/sub?x=1'), makeHost(res));
    expect(res.statusCalls).toEqual([303]);
    expect(res.headers.get('Location')).toBe(
      '/brain/login?next=%2Fbrain%2Fsub%3Fx%3D1',
    );
    expectSecurityHeaders(res);
    expect(res.body).toBe('');
  });

  it('omits the next parameter when the target is the brain root', () => {
    const res = makeResponse();
    filter.catch(new UnauthenticatedException('/brain'), makeHost(res));
    expect(res.statusCalls).toEqual([303]);
    expect(res.headers.get('Location')).toBe('/brain/login');
  });

  it('renders a plain not found page without the exception message', () => {
    const res = makeResponse();
    filter.catch(new HttpException('nonsense message', 404), makeHost(res));
    expect(res.statusCalls).toEqual([404]);
    expect(res.body).toContain('not found');
    expect(res.body).not.toContain('nonsense message');
    expect(res.headers.has('X-Robots-Tag')).toBe(true);
  });

  it('renders a generic failure page for other http exceptions', () => {
    const res = makeResponse();
    filter.catch(new ForbiddenException(), makeHost(res));
    expect(res.statusCalls).toEqual([403]);
    expect(res.body).toContain('the request failed (status 403)');
    expect(res.body).not.toContain('Forbidden');
    expect(res.headers.has('Location')).toBe(false);
  });

  it('renders a 500 page and logs one redacted line for unknown errors', () => {
    const spy = silenceLogger();
    try {
      const res = makeResponse();
      filter.catch(new Error('SECRET-NOTE-CONTENT'), makeHost(res));
      expect(res.statusCalls).toEqual([500]);
      expect(res.body).toContain('something went wrong');
      expect(res.body).not.toContain('SECRET-NOTE-CONTENT');
      expect(spy).toHaveBeenCalledTimes(1);
      const args: unknown[] = spy.mock.calls[0];
      expect(args).toHaveLength(1);
      const line = args[0];
      expect(typeof line).toBe('string');
      expect(line).toMatch(/^brain: error name=Error code=/);
      expect(line).not.toContain('SECRET-NOTE-CONTENT');
    } finally {
      spy.mockRestore();
    }
  });

  it('writes nothing when the headers were already sent', () => {
    const res = makeResponse();
    res.headersSent = true;
    filter.catch(new UnauthenticatedException('/brain/sub'), makeHost(res));
    expect(res.headers.size).toBe(0);
    expect(res.body).toBeNull();
    expect(res.statusCalls).toEqual([]);
  });

  it('applies the security headers on every write path', () => {
    const spy = silenceLogger();
    try {
      const cases: unknown[] = [
        new UnauthenticatedException('/brain/sub?x=1'),
        new UnauthenticatedException('/brain'),
        new HttpException('nonsense message', 404),
        new ForbiddenException(),
        new Error('SECRET-NOTE-CONTENT'),
      ];
      for (const exception of cases) {
        const res = makeResponse();
        filter.catch(exception, makeHost(res));
        expectSecurityHeaders(res);
        expect(res.statusCalls).toHaveLength(1);
        expect(res.body).not.toBeNull();
      }
    } finally {
      spy.mockRestore();
    }
  });
});
