import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MailerService } from './mailer.service';
import { parseMessageBody } from './message.schema';

@Controller('api/messages')
export class MessagesController {
  constructor(private readonly mailer: MailerService) {}

  @Post()
  async create(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const input = parseMessageBody(body);
    if (!input) return void res.redirect(303, '/?error=1');
    if (input.company) return void res.redirect(303, '/?sent=1');
    const ok = await this.mailer.sendContactMessage(input.email, input.message);
    return void res.redirect(303, ok ? '/?sent=1' : '/?error=1');
  }
}
