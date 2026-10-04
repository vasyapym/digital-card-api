export interface MailMessage {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export const MAIL_TRANSPORT = 'MAIL_TRANSPORT';
