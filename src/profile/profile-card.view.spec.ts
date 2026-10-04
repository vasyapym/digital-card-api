import { ProfileCardView } from './profile-card.view';
import { Profile } from './models/profile.models';

const base: Profile = {
  id: 1,
  slug: 'vasily-argunov',
  name: 'Vasily Argunov',
  title: 'Backend Developer · PHP 8 / 1C-Bitrix',
  description: 'I build e-commerce backends.',
  location: 'Almaty, Kazakhstan',
  email: 'vasyapym@gmail.com',
  links: [{ label: 'GitHub', url: 'https://github.com/vasyapym' }],
  skills: [{ name: 'PHP 8', category: 'Languages' }],
  experience: [
    {
      company: 'Traktorodetal Group',
      position: 'Backend Developer',
      startDate: new Date('2025-12-01'),
      endDate: null,
      achievements: ['Integrated 1C and the website via CommerceML.'],
      isCurrent: true,
      durationInMonths: 11,
    },
  ],
  projects: [
    {
      name: 'vasyapym.github.io',
      description: 'Personal portfolio and interactive-experiments site.',
      url: 'https://vasyapym.github.io',
      repositoryUrl: 'https://github.com/vasyapym/vasyapym.github.io',
      technologies: ['TypeScript', 'React'],
    },
    {
      name: 'Digital Card API',
      description: 'Digital business-card API.',
      url: 'https://vasyapym.onrender.com/',
      repositoryUrl: 'https://github.com/vasyapym/digital-card-api',
      technologies: ['TypeScript', 'NestJS'],
    },
  ],
};

describe('ProfileCardView', () => {
  const view = new ProfileCardView();

  it('renders name, title, description and meta line', () => {
    const html = view.render(base);
    expect(html).toContain('<h1>Vasily Argunov</h1>');
    expect(html).toContain('Backend Developer · PHP 8 / 1C-Bitrix');
    expect(html).toContain('I build e-commerce backends.');
    expect(html).toContain('Almaty, Kazakhstan');
    expect(html).toContain('mailto:vasyapym@gmail.com');
  });

  it('escapes hostile values and rejects unsafe link schemes', () => {
    const html = view.render({
      ...base,
      skills: [{ name: '<script>alert(1)</script>', category: 'Tools' }],
      links: [{ label: 'Evil', url: 'javascript:alert(1)' }],
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<li>Evil</li>');
  });

  it('shows a start–present period with duration for the current job', () => {
    const html = view.render(base);
    expect(html).toContain('Dec 2025 — Present');
    expect(html).toContain('11 mo');
  });

  it('renders achievements, project technologies and repo links', () => {
    const html = view.render(base);
    expect(html).toContain('Integrated 1C and the website via CommerceML.');
    expect(html).toContain('<a href="https://vasyapym.github.io" rel="noopener noreferrer">vasyapym.github.io</a>');
    expect(html).toContain('href="https://github.com/vasyapym/vasyapym.github.io"');
    expect(html).toContain('<p class="desc">Personal portfolio and interactive-experiments site.</p>');
  });

  it('does not link the card’s own project row', () => {
    const html = view.render(base);
    expect(html).toContain('<h3>Digital Card API</h3>');
    expect(html).not.toContain('href="https://vasyapym.onrender.com/"');
  });

  it('renders the contact form with the endpoint contract', () => {
    const html = view.render(base);
    expect(html).toContain('<h2 id="contact-h">Contact</h2>');
    expect(html).toContain('action="/api/messages"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="message"');
    expect(html).toContain('name="company"');
    expect(html).toContain('class="hp"');
  });

  it('renders the status note only when a status is passed', () => {
    expect(view.render(base)).not.toContain('class="note sent"');
    expect(view.render(base, 'sent')).toContain('class="note sent"');
    expect(view.render(base, 'sent')).toContain('Sent — thank you');
    expect(view.render(base, 'error')).toContain('class="note error"');
  });

  it('omits data-driven sections with no data, keeps the contact form', () => {
    const html = view.render({ ...base, links: [], skills: [], experience: [], projects: [] });
    expect(html).not.toContain('Links</h2>');
    expect(html).not.toContain('Skills</h2>');
    expect(html).not.toContain('Experience</h2>');
    expect(html).not.toContain('Projects</h2>');
    expect(html).toContain('Contact</h2>');
    expect(html).toContain('mailto:');
    expect(view.render({ ...base, email: null })).not.toContain('mailto:');
  });
});
