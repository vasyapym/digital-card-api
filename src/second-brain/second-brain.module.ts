// src/second-brain/second-brain.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { systemClock } from '../common/clock';
import { QUERY_EMBEDDER } from './search/search.service';
import { SearchService } from './search/search.service';
import { NotesRepository } from './notes/notes.repository';
import { NoteView } from './notes/note.view';
import { TransformersEmbedder } from './embedding/transformers-embedder';
import { createQueryEmbedder } from './search/query-embedder.provider';
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
import { SearchView } from './views/search.view';

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
    // Query embedder for BRAIN_SEMANTIC=true; the pipeline loads lazily on the
    // first call, so a plain construction costs nothing while the flag is off.
    {
      provide: QUERY_EMBEDDER,
      useFactory: () => createQueryEmbedder(new TransformersEmbedder()),
    },
    SearchService,
    NotesRepository,
    NoteView,
    SessionGuard,
    MetaService,
    BrainLayoutView,
    LoginView,
    HomeView,
    SearchView,
    BrainExceptionFilter,
  ],
})
export class SecondBrainModule {}
