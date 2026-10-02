import type { ProfileInput } from './profile-data.schema';

export const profilesData = [
  {
    slug: 'ivan-ivanov',
    isPrimary: true,
    name: 'Иван Иванов',
    title: 'Backend-разработчик (Node.js / TypeScript)',
    description:
      'Разрабатываю серверные приложения на Node.js и TypeScript. Проектирую GraphQL/REST API, работаю с PostgreSQL через Prisma, упаковываю сервисы в Docker.',
    location: 'Москва, Россия',
    email: 'ivan.ivanov@example.com',
    links: [
      { label: 'GitHub', url: 'https://github.com/your-username' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/your-username' },
      { label: 'Telegram', url: 'https://t.me/your-username' },
    ],
    skills: [
      { name: 'TypeScript', category: 'Languages' },
      { name: 'JavaScript', category: 'Languages' },
      { name: 'Node.js', category: 'Backend' },
      { name: 'NestJS', category: 'Backend' },
      { name: 'GraphQL', category: 'Backend' },
      { name: 'REST API', category: 'Backend' },
      { name: 'PostgreSQL', category: 'Databases' },
      { name: 'Prisma', category: 'Databases' },
      { name: 'Docker', category: 'DevOps' },
      { name: 'Git', category: 'Tools' },
    ],
    experience: [
      {
        company: 'ООО «Пример»',
        position: 'Junior Backend Developer',
        startDate: '2024-03-01',
        achievements: [
          'Разработал GraphQL API для внутреннего сервиса на NestJS',
          'Перевёл локальное окружение команды на Docker Compose',
        ],
      },
      {
        company: 'Фриланс',
        position: 'Node.js Developer',
        startDate: '2023-01-01',
        endDate: '2024-02-29',
        achievements: ['Сделал 3 Telegram-бота на Node.js для малого бизнеса'],
      },
    ],
    projects: [
      {
        name: 'Digital Card API',
        description: 'Эта цифровая визитка: NestJS + GraphQL + Prisma + PostgreSQL + Docker',
        url: 'https://vasyapym.onrender.com/graphql',
        repositoryUrl: 'https://github.com/vasyapym/digital-card-api',
        technologies: ['TypeScript', 'NestJS', 'GraphQL', 'Prisma', 'PostgreSQL', 'Docker'],
      },
    ],
  },
] satisfies ProfileInput[];
