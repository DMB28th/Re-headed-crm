# Cardstack MCP server — plain Node container, config via env vars (PLAN.md hosting).
# Build from the REPO ROOT: docker build -f apps/mcp-server/Dockerfile .
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Build ONLY this service and its workspace dependencies. `pnpm build` builds
# every package including @cardstack/studio's Next.js production build, which
# this image never runs — wasted minutes, and enough extra memory that the
# build can fail outright when both service images build concurrently. The
# `...` suffix keeps the dependency graph (notably @cardstack/widgets, whose
# HTML bundles the server inlines).
RUN pnpm exec turbo run build --filter=@cardstack/mcp-server...

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app .
ENV NODE_ENV=production
# Railway: attach a volume at /data so published configs survive restarts.
ENV CARDSTACK_CONFIG_PATH=/data/cardstack-config.json
# Railway injects PORT; main.ts reads it (falls back to 3001 locally).
EXPOSE 3001
CMD ["node", "apps/mcp-server/dist/main.js"]
