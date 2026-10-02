import { Clock } from '../common/clock';
import { parseDate } from './domain/experience-period';
import { ProfileRecord, ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

const fixedClock: Clock = { now: () => new Date('2024-06-15T00:00:00Z') };

const record: ProfileRecord = {
  id: 1,
  slug: 'alex',
  isPrimary: true,
  name: 'Алекс',
  title: 'Dev',
  description: 'Био',
  location: null,
  email: null,
  links: [{ id: 1, profileId: 1, label: 'GH', url: 'https://github.com/x', sortOrder: 0 }],
  skills: [
    { id: 1, profileId: 1, name: 'TS', category: 'Languages', sortOrder: 0 },
    { id: 2, profileId: 1, name: 'Nest', category: 'Backend', sortOrder: 1 },
  ],
  experiences: [
    {
      id: 1,
      profileId: 1,
      company: 'C',
      position: 'P',
      achievements: ['a1'],
      startDate: parseDate('2024-01-01'),
      endDate: null,
      sortOrder: 0,
    },
  ],
  projects: [
    {
      id: 1,
      profileId: 1,
      name: 'P',
      description: null,
      url: 'https://example.com',
      repositoryUrl: null,
      technologies: ['TS'],
      sortOrder: 0,
    },
  ],
};

function makeService(): {
  service: ProfileService;
  repo: jest.Mocked<Pick<ProfileRepository, 'findBySlug' | 'findPrimary'>>;
} {
  const repo = { findBySlug: jest.fn(), findPrimary: jest.fn() };
  const service = new ProfileService(repo as unknown as ProfileRepository, fixedClock);
  return { service, repo };
}

describe('ProfileService', () => {
  it('без slug запрашивает основной профиль', async () => {
    const { service, repo } = makeService();
    repo.findPrimary.mockResolvedValue(record);
    const p = await service.getProfile();
    expect(repo.findPrimary).toHaveBeenCalled();
    expect(repo.findBySlug).not.toHaveBeenCalled();
    expect(p?.slug).toBe('alex');
    expect(p?.name).toBe('Алекс');
  });

  it('со slug ищет по slug; не найден => NotFoundException', async () => {
    const { service, repo } = makeService();
    repo.findBySlug.mockResolvedValue(null);
    await expect(service.getProfile('nope')).rejects.toThrow(/not found/);
    expect(repo.findBySlug).toHaveBeenCalledWith('nope');
  });

  it('маппит опыт и считает вычисляемые поля по Clock', async () => {
    const { service, repo } = makeService();
    repo.findPrimary.mockResolvedValue(record);
    const p = await service.getProfile();
    expect(p?.experience[0]).toMatchObject({
      startDate: parseDate('2024-01-01'),
      endDate: null,
      isCurrent: true,
      durationInMonths: 6,
      achievements: ['a1'],
    });
  });

  it('фильтрует навыки по категории без учёта регистра', async () => {
    const { service } = makeService();
    expect(service.filterSkills(record.skills, 'BACKEND').map((s) => s.name)).toEqual(['Nest']);
    expect(service.filterSkills(record.skills, 'languages').map((s) => s.name)).toEqual(['TS']);
    expect(service.filterSkills(record.skills, null)).toHaveLength(2);
    expect(service.filterSkills(record.skills, 'nope')).toEqual([]);
  });

  it('маппит проекты и ссылки', async () => {
    const { service, repo } = makeService();
    repo.findPrimary.mockResolvedValue(record);
    const p = await service.getProfile();
    expect(p?.projects[0]).toMatchObject({
      name: 'P',
      url: 'https://example.com',
      repositoryUrl: null,
      technologies: ['TS'],
    });
    expect(p?.links[0]).toMatchObject({ label: 'GH', url: 'https://github.com/x' });
  });
});
