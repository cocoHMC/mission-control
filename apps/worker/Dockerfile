# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile --filter @mission-control/worker
COPY apps/worker ./apps/worker
RUN pnpm -C apps/worker build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
# Install runtime deps inside the final image (pnpm symlinks need the store present).
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/worker/package.json ./apps/worker/package.json
RUN pnpm install --prod --frozen-lockfile --filter @mission-control/worker
CMD ["node", "apps/worker/dist/index.js"]
