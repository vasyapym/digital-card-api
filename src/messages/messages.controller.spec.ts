import { MessagesController } from './messages.controller';
import type { Response } from 'express';
import { MailerService } from './mailer.service';

function fakeRes(): { redirect: jest.Mock; res: Response } {
  const redirect = jest.fn();
  return { redirect, res: { redirect } as unknown as Response };
}

const mailer = { sendContactMessage: jest.fn() } as unknown as MailerService;
const controller = new MessagesController(mailer);

describe('MessagesController', () => {
  it('rejects an invalid payload with an error redirect and no send', async () => {
    const { res, redirect } = fakeRes();
    await controller.create({ email: 'nope', message: 'hi' }, res);
    expect(redirect).toHaveBeenCalledWith(303, '/?error=1');
    expect(mailer.sendContactMessage).not.toHaveBeenCalled();
  });

  it('treats a filled honeypot as success without sending', async () => {
    const { res, redirect } = fakeRes();
    await controller.create({ email: 'a@b.co', message: 'hi', company: 'spam' }, res);
    expect(redirect).toHaveBeenCalledWith(303, '/?sent=1');
    expect(mailer.sendContactMessage).not.toHaveBeenCalled();
  });

  it('sends a valid message and redirects to sent', async () => {
    const { res, redirect } = fakeRes();
    (mailer.sendContactMessage as jest.Mock).mockResolvedValueOnce(true);
    await controller.create({ email: 'a@b.co', message: 'hi' }, res);
    expect(mailer.sendContactMessage).toHaveBeenCalledWith('a@b.co', 'hi');
    expect(redirect).toHaveBeenCalledWith(303, '/?sent=1');
  });

  it('sends an anonymous message without an email', async () => {
    const { res, redirect } = fakeRes();
    (mailer.sendContactMessage as jest.Mock).mockResolvedValueOnce(true);
    await controller.create({ email: '', message: 'hi' }, res);
    expect(mailer.sendContactMessage).toHaveBeenCalledWith('', 'hi');
    expect(redirect).toHaveBeenCalledWith(303, '/?sent=1');
  });

  it('redirects to error when the mailer fails', async () => {
    const { res, redirect } = fakeRes();
    (mailer.sendContactMessage as jest.Mock).mockResolvedValueOnce(false);
    await controller.create({ email: 'a@b.co', message: 'hi' }, res);
    expect(redirect).toHaveBeenCalledWith(303, '/?error=1');
  });
});
