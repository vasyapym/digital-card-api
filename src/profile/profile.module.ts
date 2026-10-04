import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock';
import { ProfileCardView } from './profile-card.view';
import { ProfileRepository } from './profile.repository';
import { ProfileResolver } from './profile.resolver';
import { ProfileService } from './profile.service';

@Module({
  providers: [
    ProfileResolver,
    ProfileService,
    ProfileRepository,
    ProfileCardView,
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [ProfileService, ProfileCardView],
})
export class ProfileModule {}
