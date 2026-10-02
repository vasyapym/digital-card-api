# Digital Card API

Read-only GraphQL API цифровой визитки разработчика: профиль, ссылки, навыки (с фильтром по категории), опыт работы (с вычисляемыми `isCurrent` и `durationInMonths`) и проекты.

**Стек:** TypeScript · Node.js · NestJS 11 · GraphQL (code-first, Apollo) · Prisma 6 · PostgreSQL · Docker

- Demo (Apollo Sandbox): https://vasyapym.onrender.com/graphql
- Health check: https://vasyapym.onrender.com/health

> Бесплатный хостинг «засыпает» без запросов: первый запрос может занять до минуты.

> Все данные в репозитории — заглушки. Замените их своими в `src/data/profiles.data.ts`.

## Запуск с нуля

```bash
npm install          # один раз, чтобы появился package-lock.json (коммитим его)
docker compose up --build
```

- GraphQL + Sandbox: http://localhost:3000/graphql
- Health: http://localhost:3000/health

В логах по порядку: `[check-env] OK` → `All migrations have been successfully applied` → `[seed] OK` → `GraphQL Sandbox: http://localhost:3000/graphql`.

Остановить: `Ctrl+C`. Полностью удалить вместе с базой: `docker compose down -v`.

## Пример запроса

```graphql
query {
  profile {
    name
    title
    description
    links { label url }
    skills { name category }
    experience { company position startDate endDate isCurrent durationInMonths achievements }
    projects { name url repositoryUrl technologies }
  }
}
```

Фильтр навыков (без учёта регистра): `profile { skills(category: "backend") { name } }`

Несуществующий slug → GraphQL-ошибка `NotFound`.

## Архитектура

```
GraphQL-запрос
  → ProfileResolver     (тонкий слой: аргументы → сервис)
  → ProfileService      (выбор профиля, маппинг, вычисляемые поля, фильтры)
  → ProfileRepository   (только запросы Prisma)
  → PostgreSQL
```

- `src/profile/domain/experience-period.ts` — чистые функции расчёта периода опыта + unit-тесты.
- `src/data/profiles.data.ts` — **единственный источник правды** для содержимого визитки.
- `src/seed/seed.ts` — синхронизация БД с файлом данных при каждом старте контейнера.
- Схема GraphQL генерируется в памяти (`autoSchemaFile: true`): у non-root контейнера нет прав на запись.

### Источник правды и сид

При каждом старте контейнера выполняется цепочка:

```
check-env → prisma migrate deploy → seed → сервер
```

Любой упавший шаг не даёт серверу стартовать (fail-fast).

Сид работает в одной транзакции под advisory lock (безопасно при параллельных инстансах):

1. удаляет профили, чьих `slug` нет в файле данных (дети удаляются каскадом);
2. для каждого профиля делает upsert по `slug`;
3. пересоздаёт ссылки, навыки, опыт и проекты (порядок из файла = порядок в API).

Файл данных **деструктивен** по отношению к БД: ручные правки в БД будут перезаписаны. Защита:

- zod-валидация данных: ≥ 1 профиля, уникальные `slug`, ровно один `isPrimary: true`,
  даты `YYYY-MM-DD`, `endDate ≥ startDate`, уникальные навыки внутри профиля;
- та же валидация запускается как unit-тест во время `docker build`: битые данные ломают сборку, а не прод;
- ошибка внутри сида откатывает всю транзакцию.

Дочерние записи пересоздаются, поэтому их ID нестабильны и не публикуются в API.
Ключ профиля — `slug` (для Apollo Client: `typePolicies: { Profile: { keyFields: ['slug'] } }`).

### Правила расчёта опыта

- Время — UTC, точность — месяц (дни игнорируются).
- Длительность включительно: январь–март = 3, один месяц = 1.
- Нет `endDate` → текущее место; длительность считается до текущего месяца.
- `endDate` в будущем → `isCurrent: true`, длительность обрезается по текущий месяц.
- `startDate` в будущем → `isCurrent: false`, `durationInMonths: 0`.

Значения меняются раз в месяц сами по себе — не кешируйте ответы надолго.

## Локальная разработка без Docker (API)

```bash
docker compose up -d postgres
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm run seed
npm run start:dev
npm test
```

Compose публикует Postgres на хосте как `localhost:5433` (5432 часто занят локальным Postgres — например, `brew services` с postgresql@16).

## Изменение схемы БД

```bash
# правим prisma/schema.prisma, затем:
npx prisma migrate dev --name <описание>
```

Проверка, что миграции соответствуют схеме (нужна отдельная пустая shadow-БД):

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DIRECT_URL" --exit-code
```

## Переменные окружения

Валидируются при старте (zod, fail-fast); при ошибке процесс завершается с понятным сообщением.

| Переменная | Обязательна | Описание |
|---|---|---|
| `DATABASE_URL` | да | Подключение для приложения (у Neon — **pooled**, хост с `-pooler`) |
| `DIRECT_URL` | да | Прямое подключение для миграций и сида (у Neon — без `-pooler`) |
| `PORT` | нет (3000) | Порт HTTP; Render задаёт его сам |
| `NODE_ENV` | нет | `development` \| `production` \| `test` |

## Деплой: Neon + Render

### Neon

1. Создайте проект (регион — Frankfurt), возьмите две строки подключения:
   - **pooled** (хост содержит `-pooler`) → `DATABASE_URL`, добавьте `?sslmode=require&connect_timeout=15`;
   - **direct** → `DIRECT_URL`, добавьте `?sslmode=require&connect_timeout=15`.
2. Если в скопированной строке есть параметр `channel_binding=require` — удалите его (Prisma может не подключиться).

### Render

1. New → Web Service → подключите репозиторий, Runtime: **Docker** (или используйте `render.yaml` как Blueprint).
2. Health Check Path: `/health`.
3. Environment: `DATABASE_URL` и `DIRECT_URL` (как секреты).
4. Деплой: в логах должны появиться те же строки, что при локальном запуске.
5. Впишите полученный URL в `src/data/profiles.data.ts` (поле `url` проекта) и в этот README, затем commit + push — Render пересоберёт сам.

На платном плане Render миграции и сид можно вынести в `preDeployCommand`.

## Безопасность и ограничения

- Introspection и Sandbox намеренно включены в проде: API публичный и read-only, данные и так открыты.
- Контейнер работает от непривилегированного пользователя `node`, на диск ничего не пишет.
- В схеме нет циклических связей, поэтому глубина запросов ограничена естественным образом.
- Возможные улучшения: rate limiting (`@nestjs/throttler`), лимит сложности запроса (алиасы позволяют запросить `profile` много раз), helmet — но его CSP по умолчанию ломает Sandbox.
