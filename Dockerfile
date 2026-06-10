# syntax=docker/dockerfile:1

# --- Build stage: install deps (compiles the better-sqlite3 native addon) and bundle. ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain needed to compile better-sqlite3's native addon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Hoisted linker => a flat, real node_modules that copies cleanly into the runtime stage.
RUN pnpm install --node-linker=hoisted

COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
COPY public ./public
RUN pnpm build

# --- Runtime stage: just Node + the built output. ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
