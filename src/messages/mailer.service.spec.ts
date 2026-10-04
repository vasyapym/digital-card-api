import { MailerService } from './mailer.service';
import type { MailTransport } from './mail.transport';

const config = {
  get: (key: string) => ({ SMTP_USER: 'card@vasyapym.onrender.com' })[key],
} as never;

function service(transport: MailTransport | null): MailerService {
  return new MailerService(config, transport);
}

function freshTransport(): MailTransport {
  return { sendMail: jest.fn().mockResolvedValue({ accepted: ['x'] }) };
}

describe('MailerService', () => {
  it('sends to the owner with the visitor as reply-to', async () => {
    const transport = freshTransport();
    const svc = service(transport);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(true);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'card@vasyapym.onrender.com',
      to: 'vasyapym@gmail.com',
      replyTo: 'visitor@company.com',
      subject: 'Card message from visitor@company.com',
      text: 'From: visitor@company.com\n\nHello',
    });
  });

  it('sends an anonymous message without reply-to', async () => {
    const transport = freshTransport();
    const svc = service(transport);
    await expect(svc.sendContactMessage('', 'Hello')).resolves.toBe(true);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'card@vasyapym.onrender.com',
      to: 'vasyapym@gmail.com',
      subject: 'Card message from the card',
      text: 'From: (no email given)\n\nHello',
    });
  });

  it('reports false when SMTP is not configured', async () => {
    const transport = freshTransport();
    const svc = service(null);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(false);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('reports false when the transport throws', async () => {
    const failing: MailTransport = { sendMail: jest.fn().mockRejectedValue(new Error('smtp down')) };
    const svc = service(failing);
    await expect(svc.sendContactMessage('visitor@company.com', 'Hello')).resolves.toBe(false);
  });
});
