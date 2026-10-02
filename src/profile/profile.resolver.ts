import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Profile, Skill } from './models/profile.models';
import { ProfileService } from './profile.service';

@Resolver(() => Profile)
export class ProfileResolver {
  constructor(private readonly profileService: ProfileService) {}

  @Query(() => Profile, {
    description: 'Профиль специалиста. Без аргумента возвращает основной профиль.',
  })
  profile(@Args('slug', { type: () => String, nullable: true }) slug?: string | null): Promise<Profile> {
    return this.profileService.getProfile(slug ?? undefined);
  }

  @ResolveField(() => [Skill], {
    description: 'Навыки; опционально — фильтр по категории (без учёта регистра)',
  })
  skills(
    @Parent() profile: Profile,
    @Args('category', { type: () => String, nullable: true }) category?: string | null,
  ): Skill[] {
    return this.profileService.filterSkills(profile.skills, category ?? null);
  }
}
