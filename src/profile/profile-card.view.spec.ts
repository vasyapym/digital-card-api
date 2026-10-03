import { ProfileCardView } from './profile-card.view';
import { Profile } from './models/profile.models';

const base: Profile = {
  id: 1,
  slug: 'vasily-argunov',
  name: 'Vasily Argunov',
  title: 'Backend Developer · PHP 8 / 1C-Bitrix',
  description: 'I build e-commerce backends.',
  location: 'Saint Petersburg, Russia',
  email: 'vasyapym@gmail.com',
  links: [{ label: 'Telegram', url: 'https://t.me/vspmzx' }],
  skills: [{ name: 'PHP 8', category: 'Languages' }],
  experience: [
    {
      company: 'Traktorodetal Group',
      position: 'Backend Developer',
      startDate: new Date('2025-12-01'),
      endDate: null,
      achievements: [],
      isCurrent: true,
      durationInMonths: 11,
    },
  ],
  projects: [],
};

describe('ProfileCardView', () => {
  const view = new ProfileCardView();

  it('renders name, title and description', () => {
    const html = view.render(base);
    expect(html).toContain('<h1>Vasily Argunov</h1>');
    expect(html).toContain('Backend Developer · PHP 8 / 1C-Bitrix');
    expect(html).toContain('I build e-commerce backends.');
  });

  it('escapes hostile values', () => {
    const html = view.render({
      ...base,
      skills: [{ name: '<script>alert(1)</script>', category: 'Tools' }],
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows a start–present period for the current job', () => {
    expect(view.render(base)).toContain('Dec 2025 — Present');
  });

  it('omits sections with no data', () => {
    const html = view.render({ ...base, location: null, email: null, links: [], skills: [], experience: [], projects: [] });
    expect(html).not.toContain('Links</h2>');
    expect(html).not.toContain('Skills</h2>');
    expect(html).not.toContain('Experience</h2>');
    expect(html).not.toContain('Projects</h2>');
    expect(html).not.toContain('mailto:');
  });
});
