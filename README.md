# Digital Card API

Read-only GraphQL API behind my digital business card: profile, links, skills (filterable by category), experience (computed `isCurrent` and `durationInMonths`), and projects.

Live: https://vasyapym.onrender.com — API sandbox: https://vasyapym.onrender.com/graphql — Health: https://vasyapym.onrender.com/health

## Stack

TypeScript · NestJS 11 · GraphQL (code-first, Apollo) · Prisma 6 · PostgreSQL (Neon) · Jest · Docker

## How it runs

- Render (free plan, Docker runtime, health check `/health`). Free instances sleep, so UptimeRobot keeps it warm with a HEAD request every 5 minutes.
- PostgreSQL is hosted on Neon. `DATABASE_URL` uses the pooled connection, `DIRECT_URL` the direct one (validated at startup with zod, fail-fast).
- Startup chain in the container: `check-env → prisma migrate deploy → seed → server`. Any failed step prevents boot.
- `src/data/profiles.data.ts` is the single source of truth for the card content. On every start the seed replaces the database state with this file (upserts inside one transaction under an advisory lock).
- The Contact form on the card POSTs to `/api/messages`, which forwards the message to the owner's email via the Resend HTTP API (set `RESEND_API_KEY` as a Render secret; sender is `onboarding@resend.dev`, visitor goes to Reply-To).

## Local run

```bash
docker compose up --build
# card: http://localhost:3000  sandbox: /graphql  health: /health
```

Query example:

```graphql
query {
  profile {
    name
    title
    skills { name category }
    experience { company position isCurrent durationInMonths }
    projects { name url repositoryUrl technologies }
  }
}
```

MIT.
