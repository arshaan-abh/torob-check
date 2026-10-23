FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo prune web --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
RUN pnpm turbo build --filter=web...

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/packages/db/drizzle ./packages/db/drizzle

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
