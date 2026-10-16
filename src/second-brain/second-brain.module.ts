// src/second-brain/second-brain.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { systemClock } from '../common/clock';
import { SessionService } from './auth/session.service';
import { SessionGuard } from './auth/session.guard';
import { LoginThrottle } from './auth/login-throttle';
import { PassphraseService } from './auth/passphrase.service';
import { BrainController } from './web/brain.controller';
import { MetaService } from './web/meta.service';
import { BrainExceptionFilter } from './web/brain-exception.filter';
import { BrainLayoutView } from './views/layout';
import { LoginView } from './views/login.view';
import { HomeView } from './views/home.view';

// Mounted by AppModule only when BRAIN_ENABLED === 'true'.
// ConfigService and PrismaService come from global modules, so no imports here.
@Module({
  controllers: [BrainController],
  providers: [
    {
      provide: SessionService,
      useFactory: (config: ConfigService<Env, true>) =>
        new SessionService(config.getOrThrow('BRAIN_SESSION_SECRET')),
      inject: [ConfigService],
    },
    {
      provide: PassphraseService,
      useFactory: (config: ConfigService<Env, true>) =>
        new PassphraseService(config.getOrThrow('BRAIN_PASSPHRASE_HASH')),
      inject: [ConfigService],
    },
    {
      provide: LoginThrottle,
      useFactory: () => new LoginThrottle(systemClock),
    },
    SessionGuard,
    MetaService,
    BrainLayoutView,
    LoginView,
    HomeView,
    BrainExceptionFilter,
  ],
})
export class SecondBrainModule {}
