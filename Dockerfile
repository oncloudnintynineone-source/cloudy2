# syntax=docker/dockerfile:1

# Cloud Run image (shadow deployment, see docs/developer-guide.md §1.9.1). Runs
# the regular `next start` server over the full `.next` build — deliberately NOT
# `output: standalone`: pnpm's isolated (symlinked) node_modules layout makes
# standalone tracing drop packages (e.g. @swc/helpers -> MODULE_NOT_FOUND), and a
# hoisted-linker fix would fork the repo's install config. Copying the full
# node_modules costs image size but is robust and needs no layout tricks. The
# same commit builds unchanged on Vercel — next.config.ts carries no Cloud
# Run-specific settings.

FROM node:24-slim AS base

FROM base AS deps
RUN npm install -g pnpm@11.18.0
WORKDIR /app
# .npmrc carries the fetch-timeout/retry settings; pnpm-workspace.yaml carries
# the allowBuilds list pnpm 11 enforces (native build scripts for esbuild/sharp/
# unrs-resolver must run) — both must be present or the install misbehaves.
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
RUN npm install -g pnpm@11.18.0
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined into the client bundle at build time. The
# deploy job (ci.yml) passes the VAPID public key as a build arg so the Cloud
# Run image's clients can subscribe to push, exactly like Vercel's own build.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
# next start resolves everything through the real node_modules tree (default
# pnpm isolated layout works fine at runtime), so copy it wholesale.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
# next start reloads next.config.ts at boot; tsconfig + next-env.d.ts keep its
# TS/path-alias handling happy.
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/next-env.d.ts ./next-env.d.ts
USER node
EXPOSE 8080
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "8080"]
