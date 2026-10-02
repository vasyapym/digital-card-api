import { parseProfilesData, ProfileInput } from './profile-data.schema';
import { profilesData } from './profiles.data';

describe('profiles.data', () => {
  it('реальный файл данных проходит валидацию', () => {
    expect(() => parseProfilesData(profilesData)).not.toThrow();
  });
});

describe('parseProfilesData', () => {
  const base = (over: Partial<ProfileInput> = {}): ProfileInput => ({
    slug: 'a',
    isPrimary: true,
    name: 'A',
    title: 'T',
    description: 'D',
    ...over,
  });

  it('отклоняет пустой список', () => {
    expect(() => parseProfilesData([])).toThrow(/хотя бы один профиль/);
  });

  it('отклоняет дубликаты slug', () => {
    expect(() => parseProfilesData([base(), base({ isPrimary: false })])).toThrow(/дубликат slug/);
  });

  it('требует ровно один основной профиль', () => {
    expect(() => parseProfilesData([base({ isPrimary: false })])).toThrow(/ровно один/);
    expect(() => parseProfilesData([base(), base({ slug: 'b' })])).toThrow(/ровно один/);
  });

  it('отклоняет endDate раньше startDate', () => {
    const p = base({
      experience: [{ company: 'C', position: 'P', startDate: '2022-05-01', endDate: '2022-04-01' }],
    });
    expect(() => parseProfilesData([p])).toThrow(/endDate/);
  });

  it('отклоняет неверный формат даты и slug', () => {
    expect(() =>
      parseProfilesData([base({ experience: [{ company: 'C', position: 'P', startDate: '2022-13-01' }] })]),
    ).toThrow(/YYYY-MM-DD/);
    expect(() => parseProfilesData([base({ slug: 'Bad Slug' })])).toThrow(/slug/);
  });

  it('отклоняет дубликат навыка', () => {
    const p = base({
      skills: [
        { name: 'TS', category: 'Languages' },
        { name: 'ts', category: 'Languages' },
      ],
    });
    expect(() => parseProfilesData([p])).toThrow(/дубликат навыка/);
  });

  it('проставляет значения по умолчанию', () => {
    const [p] = parseProfilesData([base()]);
    expect(p.skills).toEqual([]);
    expect(p.links).toEqual([]);
    expect(p.experience).toEqual([]);
    expect(p.projects).toEqual([]);
  });
});
