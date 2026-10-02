import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock';
import { ProfileRepository } from './profile.repository';
import { ProfileResolver } from './profile.resolver';
import { ProfileService } from './profile.service';

@Module({
  providers: [
    ProfileResolver,
    ProfileService,
    ProfileRepository,
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class ProfileModule {}
