import { MailerService, ResendMailTransport, mailTransportFactory } from './mailer.service';
import type { MailTransport } from './mail.transport';

type FetchCall = [string, { method: string; headers: Record<string, string>; body: string }];

function freshTransport(): MailTransport {
  return { sendMail: jest.fn().mockResolvedValue({ id: 'x' }) };
}

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('MailerService', () => {
  it('sends to the owner with the visitor as reply-to', async () => {
    const transport = freshTransport();
    const svc = new MailerService(transport);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(true);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'onboarding@resend.dev',
      to: 'vasyapym@gmail.com',
      replyTo: 'visitor@company.com',
      subject: 'Card message from visitor@company.com',
      text: 'From: visitor@company.com\n\nHello',
    });
  });

  it('sends an anonymous message without reply-to', async () => {
    const transport = freshTransport();
    const svc = new MailerService(transport);
    await expect(svc.sendContactMessage('', 'Hello')).resolves.toBe(true);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'onboarding@resend.dev',
      to: 'vasyapym@gmail.com',
      subject: 'Card message from the card',
      text: 'From: (no email given)\n\nHello',
    });
  });

  it('reports false when email is not configured', async () => {
    const transport = freshTransport();
    const svc = new MailerService(null);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(false);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('reports false when the transport throws', async () => {
    const failing: MailTransport = { sendMail: jest.fn().mockRejectedValue(new Error('resend down')) };
    const svc = new MailerService(failing);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(false);
  });
});

describe('ResendMailTransport', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function lastCall(): FetchCall {
    return fetchMock.mock.calls[0] as FetchCall;
  }

  it('posts the visitor message to Resend with reply_to', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { id: 'abc' }));
    const svc = new MailerService(new ResendMailTransport('re_test_key'));
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = lastCall();
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test_key');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      from: 'onboarding@resend.dev',
      to: ['vasyapym@gmail.com'],
      reply_to: 'visitor@company.com',
      subject: 'Card message from visitor@company.com',
      text: 'From: visitor@company.com\n\nHello',
    });
  });

  it('omits reply_to for an anonymous message', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { id: 'abc' }));
    const svc = new MailerService(new ResendMailTransport('re_test_key'));
    await expect(svc.sendContactMessage('', 'Hello')).resolves.toBe(true);
    const body = JSON.parse(lastCall()[1].body) as Record<string, unknown>;
    expect(body).toEqual({
      from: 'onboarding@resend.dev',
      to: ['vasyapym@gmail.com'],
      subject: 'Card message from the card',
      text: 'From: (no email given)\n\nHello',
    });
    expect(body).not.toHaveProperty('reply_to');
  });

  it('rejects on a non-2xx response and the service reports false', async () => {
    const forbidden = { statusCode: 403, name: 'validation_error', message: 'not allowed' };
    fetchMock.mockResolvedValue(fakeResponse(403, forbidden));
    const transport = new ResendMailTransport('re_test_key');
    await expect(
      transport.sendMail({ from: 'onboarding@resend.dev', to: 'vasyapym@gmail.com', subject: 's', text: 't' }),
    ).rejects.toThrow('Resend responded 403');
    const svc = new MailerService(transport);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(false);
  });
});

describe('mailTransportFactory', () => {
  function configWith(values: Record<string, string | undefined>) {
    return { get: (key: string) => values[key] } as never;
  }

  it('returns null without RESEND_API_KEY', () => {
    expect(mailTransportFactory.useFactory(configWith({}))).toBeNull();
    expect(mailTransportFactory.useFactory(configWith({ RESEND_API_KEY: '  ' }))).toBeNull();
  });

  it('returns a Resend transport when RESEND_API_KEY is set', () => {
    expect(mailTransportFactory.useFactory(configWith({ RESEND_API_KEY: 're_x' }))).toBeInstanceOf(
      ResendMailTransport,
    );
  });
});
