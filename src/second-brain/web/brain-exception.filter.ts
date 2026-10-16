// src/second-brain/web/brain-exception.filter.ts
import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { BrainLayoutView } from '../views/layout';
import { UnauthenticatedException } from '../auth/session.guard';
import { applyBrainHeaders } from './security-headers';

// Scoped filter for /brain: every failure ends as a redirect or a rendered HTML page.
@Catch()
export class BrainExceptionFilter implements ExceptionFilter {
  constructor(private readonly layout: BrainLayoutView) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      return;
    }
    applyBrainHeaders(res);

    // Subclass of HttpException, so it must be checked first.
    if (exception instanceof UnauthenticatedException) {
      const redirectUrl =
        exception.next === '/brain'
          ? '/brain/login'
          : '/brain/login?next=' + encodeURIComponent(exception.next);
      res.status(303);
      res.setHeader('Location', redirectUrl);
      res.send('');
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) {
        res.status(404);
        res.send(this.layout.render('not found', '<p class="meta">nothing here</p>'));
        return;
      }
      res.status(status);
      res.send(
        this.layout.render(
          'error',
          '<p class="meta">the request failed (status ' + String(status) + ')</p>',
        ),
      );
      return;
    }

    // Unknown failure: one redacted line, never the message, stack or request data.
    const fields: { name?: unknown; code?: unknown } =
      exception === null || exception === undefined
        ? {}
        : (exception as { name?: unknown; code?: unknown });
    const name = typeof fields.name === 'string' ? fields.name : '-';
    const code = typeof fields.code === 'string' ? fields.code : '-';
    Logger.error('brain: error name=' + name + ' code=' + code);
    res.status(500);
    res.send(this.layout.render('error', '<p class="meta">something went wrong</p>'));
  }
}
