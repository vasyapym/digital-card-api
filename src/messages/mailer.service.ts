import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { MailMessage, MailTransport, MAIL_TRANSPORT } from './mail.transport';

const OWNER_EMAIL = 'vasyapym@gmail.com';
const MAIL_FROM = 'onboarding@resend.dev';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

export class ResendMailTransport implements MailTransport {
  constructor(private readonly apiKey: string) {}

  async sendMail(message: MailMessage): Promise<unknown> {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 500)}`);
    }
    return response.json().catch(() => null);
  }
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null) {}

  async sendContactMessage(fromEmail: string, message: string): Promise<boolean> {
    if (!this.transport) {
      this.logger.warn('Email is not configured (RESEND_API_KEY) — contact message not sent');
      return false;
    }
    const subject = fromEmail ? `Card message from ${fromEmail}` : 'Card message from the card';
    const text = fromEmail ? `From: ${fromEmail}\n\n${message}` : `From: (no email given)\n\n${message}`;
    try {
      await this.transport.sendMail({
        from: MAIL_FROM,
        to: OWNER_EMAIL,
        ...(fromEmail ? { replyTo: fromEmail } : {}),
        subject,
        text,
      });
      return true;
    } catch (err) {
      this.logger.error(`sendMail failed: ${(err as Error).message}`);
      return false;
    }
  }
}

export const mailTransportFactory = {
  provide: MAIL_TRANSPORT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): MailTransport | null => {
    const apiKey = config.get('RESEND_API_KEY', { infer: true })?.trim();
    if (!apiKey) return null;
    return new ResendMailTransport(apiKey);
  },
};
