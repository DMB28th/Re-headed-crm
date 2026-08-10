# Cardstack Studio — Next.js server.
# Build from the REPO ROOT: docker build -f apps/studio/Dockerfile .
#
# NOTE: Studio and the MCP server share the config store. The file-backed
# store needs a SHARED filesystem — fine for single-box deploys (one machine,
# both processes, one /data). On Railway, volumes attach to ONE service only,
# so deploying Studio as a second service requires the Postgres-backed
# AdminConfigStore (planned; same interface).
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Build ONLY this service and its workspace dependencies. `pnpm build` builds
# every package including the MCP server, which this image never runs — wasted
# minutes, and enough extra memory that a build can fail outright when both
# service images build concurrently. The `...` suffix keeps the dependency
# graph (notably @cardstack/widgets, which the builder imports for its live
# preview).
RUN pnpm exec turbo run build --filter=@cardstack/studio...

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app .
ENV NODE_ENV=production
ENV CARDSTACK_CONFIG_PATH=/data/cardstack-config.json
EXPOSE 3002
CMD ["sh", "-c", "cd apps/studio && ./node_modules/.bin/next start -p ${PORT:-3002}"]
