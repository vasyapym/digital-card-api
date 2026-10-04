import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProfileService } from './profile/profile.service';
import { ProfileCardView } from './profile/profile-card.view';

@Controller()
export class AppController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly profileCardView: ProfileCardView,
  ) {}

  @Get()
  async card(
    @Query('sent') sent: string | undefined,
    @Query('error') error: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const profile = await this.profileService.getProfile();
    if (sent === '1' || error === '1') {
      res.setHeader('Cache-Control', 'no-store');
      return this.profileCardView.render(profile, sent === '1' ? 'sent' : 'error');
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    return this.profileCardView.render(profile);
  }
}
