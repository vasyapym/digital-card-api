import type { ProfileInput } from './profile-data.schema';

export const profilesData = [
  {
    slug: 'vasily-argunov',
    isPrimary: true,
    name: 'Vasily Argounov',
    title: 'Backend Developer · PHP 8 / 1C-Bitrix',
    description:
      'I build e-commerce backends on PHP 8 and 1C-Bitrix (D7) — 1C integrations, SQL performance, catalog tooling for 400,000+ SKUs — ' +
      'and work in TypeScript (Node, NestJS) and Laravel as well; Python (pandas, regex) covers data analysis and pipeline automation. ' +
      'Open to full-time, part-time, and project work—on-site, hybrid, or remote. ' +
      'Based in Almaty; available for business travel and relocation.',
    location: 'Almaty, Kazakhstan',
    email: 'vasyapym@gmail.com',
    links: [
      { label: 'GitHub', url: 'https://github.com/vasyapym' },
      { label: 'Telegram', url: 'https://t.me/vspmzx' },
      { label: 'WhatsApp', url: 'https://wa.me/79142760124' },
    ],
    skills: [
      { name: 'PHP 8', category: 'Languages' },
      { name: '1C-Bitrix (D7)', category: 'Backend' },
      { name: 'TypeScript', category: 'Languages' },
      { name: 'Python', category: 'Languages' },
      { name: 'Laravel', category: 'Backend' },
      { name: 'Symfony', category: 'Backend' },
      { name: 'PostgreSQL', category: 'Databases' },
      { name: 'MySQL', category: 'Databases' },
      { name: 'SQL', category: 'Languages' },
      { name: 'CommerceML (1C)', category: 'Backend' },
      { name: 'Bitrix24 REST API', category: 'Backend' },
      { name: 'REST API integrations', category: 'Backend' },
      { name: 'Redis', category: 'Databases' },
      { name: 'Docker', category: 'DevOps' },
      { name: 'Linux', category: 'DevOps' },
      { name: 'nginx', category: 'DevOps' },
      { name: 'Git', category: 'Tools' },
      { name: 'GitLab', category: 'Tools' },
      { name: 'PHPUnit', category: 'Tools' },
    ],
    experience: [
      {
        company: 'Traktorodetal Group',
        position: 'Backend Developer',
        startDate: '2025-12-01',
        achievements: [
          'Integrated 1C and the website via CommerceML to synchronize catalog data, stock levels, and prices.',
          'Built product mapping for the customer account area, covering 400,000+ items across 250+ categories.',
          'Resolved N+1 query issues and optimized slow pagination COUNT queries across the site.',
          'Developed PHP modules for smart filters, bulk photo uploads matched by 1C code, and catalog property management.',
          'Created admin audit tools to check catalog data completeness across 30,000+ items.',
          'Added IP-based geolocation and connected website forms to Bitrix24 CRM through its REST API.',
          'Introduced an AI-agent-assisted development workflow with code review, security audits, and a YAGNI policy.',
        ],
      },
      {
        company: 'Levenhuk Group',
        position: 'Web Developer',
        startDate: '2024-09-01',
        endDate: '2025-12-31',
        achievements: [
          'Optimized homepage performance: 2,445 ms → 1,432 ms (−41%), page weight −37%, and JavaScript files 23 → 13.',
          'Reduced product-page weight by 50% and server requests by 21%.',
          'Removed redundant SQL queries and added caching for expensive page blocks.',
          'Implemented generation of H1–H3 headings, title tags, and meta descriptions across multiple group websites.',
          'Developed templates and components for four 1C-Bitrix websites within an international optics group.',
        ],
      },
      {
        company: 'North-Eastern Federal University — Arctic Linguistic Ecology Lab',
        position: 'Junior Researcher',
        startDate: '2021-01-01',
        endDate: '2024-08-31',
        achievements: [
          'Conducted quantitative analysis of large text corpora using Python, pandas, and regular expressions.',
          'Automated parsing, cleaning, and computation across large datasets for linguistic research.',
        ],
      },
    ],
    projects: [
      {
        name: 'Digital Card API',
        description:
          'Digital business-card API built with NestJS and GraphQL, using Prisma and PostgreSQL for data persistence and Docker for containerization.',
        url: 'https://vasyapym.onrender.com/',
        repositoryUrl: 'https://github.com/vasyapym/digital-card-api',
        technologies: [
          'TypeScript',
          'NestJS',
          'GraphQL',
          'Prisma',
          'PostgreSQL',
          'Docker',
        ],
      },
      {
        name: 'vasyapym.github.io',
        description:
          'Personal portfolio and interactive-experiments site: eight self-contained projects with Go and Rust cores compiled to WebAssembly.',
        url: 'https://vasyapym.github.io',
        repositoryUrl: 'https://github.com/vasyapym/vasyapym.github.io',
        technologies: [
          'TypeScript',
          'React',
          'Go',
          'Rust',
          'WebAssembly',
          'three.js',
        ],
      },
    ],
  },
] satisfies ProfileInput[];
