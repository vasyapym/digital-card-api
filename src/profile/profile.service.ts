import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, CLOCK } from '../common/clock';
import { durationInMonths, isCurrentExperience } from './domain/experience-period';
import { Profile, Skill } from './models/profile.models';
import { ProfileRecord, ProfileRepository } from './profile.repository';

@Injectable()
export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getProfile(slug?: string): Promise<Profile> {
    const normalizedSlug = slug?.trim();
    const record = normalizedSlug
      ? await this.repository.findBySlug(normalizedSlug)
      : await this.repository.findPrimary();

    if (!record) {
      throw new NotFoundException(
        normalizedSlug ? `Profile "${normalizedSlug}" not found` : 'Profile not found',
      );
    }
    return this.toModel(record);
  }

  filterSkills(skills: Skill[], category: string | null): Skill[] {
    if (category === null) return skills;
    const needle = category.toLowerCase();
    return skills.filter((s) => s.category.toLowerCase() === needle);
  }

  private toModel(r: ProfileRecord): Profile {
    const now = this.clock.now();
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      title: r.title,
      description: r.description,
      location: r.location,
      email: r.email,
      links: r.links.map((l) => ({ label: l.label, url: l.url })),
      skills: r.skills.map((s) => ({ name: s.name, category: s.category })),
      experience: r.experiences.map((e) => ({
        company: e.company,
        position: e.position,
        startDate: e.startDate,
        endDate: e.endDate,
        achievements: e.achievements,
        isCurrent: isCurrentExperience(e, now),
        durationInMonths: durationInMonths(e, now),
      })),
      projects: r.projects.map((p) => ({
        name: p.name,
        description: p.description,
        url: p.url,
        repositoryUrl: p.repositoryUrl,
        technologies: p.technologies,
      })),
    };
  }
}
