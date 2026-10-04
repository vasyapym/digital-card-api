import { Module } from '@nestjs/common';
import { mailTransportFactory } from './mailer.service';
import { MailerService } from './mailer.service';
import { MessagesController } from './messages.controller';

@Module({
  providers: [mailTransportFactory, MailerService],
  controllers: [MessagesController],
})
export class MessagesModule {}
