import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { Env } from '../config/env';
import { MailTransport, MAIL_TRANSPORT } from './mail.transport';

const OWNER_EMAIL = 'vasyapym@gmail.com';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
  ) {}

  async sendContactMessage(fromEmail: string, message: string): Promise<boolean> {
    const user = this.config.get('SMTP_USER', { infer: true });
    if (!this.transport || !user) {
      this.logger.warn('SMTP is not configured (SMTP_USER/SMTP_PASS) — contact message not sent');
      return false;
    }
    const subject = fromEmail ? `Card message from ${fromEmail}` : 'Card message from the card';
    const text = fromEmail ? `From: ${fromEmail}\n\n${message}` : `From: (no email given)\n\n${message}`;
    try {
      await this.transport.sendMail({
        from: user,
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
    const user = config.get('SMTP_USER', { infer: true });
    const pass = config.get('SMTP_PASS', { infer: true });
    if (!user || !pass) return null;
    const host = config.get('SMTP_HOST', { infer: true }) ?? 'smtp.gmail.com';
    const port = config.get('SMTP_PORT', { infer: true }) ?? 465;
    return createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  },
};
