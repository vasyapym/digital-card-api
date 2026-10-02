# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate \
 && npm test \
 && npm run build
RUN npm prune --omit=dev \
 && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

USER node
EXPOSE 3000

CMD ["sh", "-c", "node dist/config/check-env.js && ./node_modules/.bin/prisma migrate deploy && node dist/seed/seed.js && exec node dist/main.js"]
