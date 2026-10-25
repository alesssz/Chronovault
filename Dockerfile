# syntax=docker/dockerfile:1

# Chronovault — production image of the Nuxt app (Supabase runs separately).
# Built and started by `pnpm docker` / `make docker` through compose.yaml.

ARG NODE_VERSION=24

# --- Build --------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@12.14.0

# The whole project (minus .dockerignore) is the build context.
COPY . .
# The pnpm store is a BuildKit cache: rebuilds do not download packages again.
RUN --mount=type=cache,id=chronoplayer-pnpm-store,target=/app/.pnpm-store \
    pnpm install --frozen-lockfile
RUN pnpm build

# --- Runtime ------------------------------------------------------------------
# Only the self-contained Nitro output is shipped: no source, no node_modules.
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output
# Run as the unprivileged `node` user, not root.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", ".output/server/index.mjs"]
