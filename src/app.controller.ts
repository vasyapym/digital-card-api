import { Controller, Get, Header } from '@nestjs/common';
import { ProfileService } from './profile/profile.service';
import { ProfileCardView } from './profile/profile-card.view';

@Controller()
export class AppController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly profileCardView: ProfileCardView,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async card(): Promise<string> {
    const profile = await this.profileService.getProfile();
    return this.profileCardView.render(profile);
  }
}
